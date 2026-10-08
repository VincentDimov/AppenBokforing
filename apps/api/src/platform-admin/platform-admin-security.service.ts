import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@ledgerapp/db";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import { DatabaseService } from "../database/database.service";
import { AuthSettingsService } from "../auth/auth-settings.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { decryptMfaSecret, encryptMfaSecret, mfaEncryptionKey } from "./mfa-crypto";
import { hashPassword, validPrivilegedPassword } from "./password-policy";
import { hasPlatformPermission, type PlatformPermission } from "./platform-admin.permissions";

export interface AdminContext {
  user: AuthenticatedUser;
  requestId?: string;
  ipMetadata?: string;
}

@Injectable()
export class PlatformAdminSecurityService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly settings: AuthSettingsService
  ) {}

  encryptionConfigured() {
    return Boolean(mfaEncryptionKey(this.config.get<string>("PLATFORM_ADMIN_MFA_ENCRYPTION_KEY")));
  }
  private key() {
    const key = mfaEncryptionKey(this.config.get<string>("PLATFORM_ADMIN_MFA_ENCRYPTION_KEY"));
    if (!key)
      throw new ServiceUnavailableException({
        code: "ADMIN_MFA_NOT_CONFIGURED",
        message: "Administratörs-MFA saknar säker serverkonfiguration."
      });
    return key;
  }
  private keyId() {
    return this.config.get<string>("PLATFORM_ADMIN_MFA_KEY_ID") ?? "v1";
  }

  async audit(
    tx: Prisma.TransactionClient,
    ctx: AdminContext,
    action: string,
    targetType: string,
    targetId?: string,
    metadata?: {
      before?: Prisma.InputJsonValue;
      after?: Prisma.InputJsonValue;
      organizationId?: string;
    },
    result = "SUCCESS"
  ) {
    return tx.platformAdminAuditEvent.create({
      data: {
        actorUserId: ctx.user.id,
        action,
        targetType,
        targetId,
        organizationId: metadata?.organizationId,
        beforeMetadata: metadata?.before,
        afterMetadata: metadata?.after,
        requestId: ctx.requestId,
        ipMetadata: ctx.ipMetadata,
        result
      }
    });
  }
  async denied(ctx: AdminContext, action: string) {
    await this.db.prisma.$transaction((tx) =>
      this.audit(tx, ctx, action, "PLATFORM", undefined, undefined, "DENIED")
    );
  }
  async requireGrant(userId: string, tx: Prisma.TransactionClient = this.db.prisma) {
    const grant = await tx.platformAdministrator.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        role: true,
        isActive: true,
        revokedAt: true,
        mustChangePassword: true,
        mfaRequired: true,
        user: { select: { isActive: true, mustChangePassword: true } }
      }
    });
    if (!grant?.isActive || grant.revokedAt || !grant.user.isActive)
      throw new ForbiddenException("Du saknar plattformsbehörighet.");
    return grant;
  }
  async state(userId: string, sessionId: string) {
    const grant = await this.requireGrant(userId);
    const [credential, session] = await Promise.all([
      this.db.prisma.platformAdminMfaCredential.findUnique({
        where: { userId },
        select: { verifiedAt: true, keyId: true }
      }),
      this.db.prisma.session.findUnique({
        where: { id: sessionId },
        select: { adminMfaVerifiedAt: true }
      })
    ]);
    return {
      role: grant.role,
      mustChangePassword: grant.mustChangePassword || grant.user.mustChangePassword,
      mfaEnrolled: Boolean(credential?.verifiedAt),
      mfaConfigured: this.encryptionConfigured(),
      mfaVerifiedAt: session?.adminMfaVerifiedAt ?? null,
      notificationDeliveryConfigured: false
    };
  }
  async assertAccess(
    ctx: AdminContext,
    permission: PlatformPermission,
    tx: Prisma.TransactionClient = this.db.prisma
  ) {
    const grant = await this.requireGrant(ctx.user.id, tx);
    if (!hasPlatformPermission(grant.role, permission))
      throw new ForbiddenException("Plattformsrollen tillåter inte åtgärden.");
    if (grant.mustChangePassword || grant.user.mustChangePassword)
      throw new ForbiddenException({
        code: "ADMIN_SECURITY_SETUP_REQUIRED",
        message: "Byt initialt lösenord före administration."
      });
    this.key();
    const [credential, session] = await Promise.all([
      tx.platformAdminMfaCredential.findUnique({
        where: { userId: ctx.user.id },
        select: { verifiedAt: true, keyId: true }
      }),
      tx.session.findUnique({
        where: { id: ctx.user.sessionId },
        select: {
          userId: true,
          revokedAt: true,
          expiresAt: true,
          absoluteExpiresAt: true,
          adminMfaVerifiedAt: true
        }
      })
    ]);
    const now = Date.now();
    const verified = session?.adminMfaVerifiedAt?.getTime();
    if (
      !session ||
      session.userId !== ctx.user.id ||
      session.revokedAt ||
      session.expiresAt.getTime() <= now ||
      session.absoluteExpiresAt.getTime() <= now
    )
      throw new UnauthorizedException("Sessionen är inte aktiv.");
    if (
      !credential?.verifiedAt ||
      credential.keyId !== this.keyId() ||
      !verified ||
      verified > now ||
      now - verified > 12 * 3600000
    )
      throw new ForbiddenException({
        code: "ADMIN_MFA_REQUIRED",
        message: "Verifiera administratörs-MFA."
      });
    if (permission !== "READ" && now - verified > 5 * 60000)
      throw new ForbiddenException({
        code: "ADMIN_STEP_UP_REQUIRED",
        message: "Bekräfta lösenord och MFA igen före känsliga åtgärder."
      });
    return grant;
  }
  private async password(tx: Prisma.TransactionClient, userId: string, password: string) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, isActive: true, mustChangePassword: true, email: true }
    });
    if (
      !user?.isActive ||
      !user.passwordHash ||
      !(await argon2.verify(user.passwordHash, password).catch(() => false))
    )
      throw new ForbiddenException("Lösenordet kunde inte verifieras.");
    return user;
  }
  private async assertMfaRate(ctx: AdminContext, tx: Prisma.TransactionClient) {
    const attempts = await tx.platformAdminAuditEvent.count({
      where: {
        actorUserId: ctx.user.id,
        action: { in: ["ADMIN_MFA_FAILED", "ADMIN_RECOVERY_FAILED"] },
        result: "DENIED",
        timestamp: { gte: new Date(Date.now() - 15 * 60000) }
      }
    });
    if (attempts >= 5)
      throw new ForbiddenException({
        code: "ADMIN_MFA_RATE_LIMIT",
        message: "För många säkerhetsförsök. Vänta 15 minuter."
      });
  }
  private async requireSession(ctx: AdminContext, tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT id FROM sessions WHERE id=${ctx.user.sessionId}::uuid FOR UPDATE`;
    const session = await tx.session.findUnique({
      where: { id: ctx.user.sessionId },
      select: { userId: true, revokedAt: true, expiresAt: true, absoluteExpiresAt: true }
    });
    if (
      !session ||
      session.userId !== ctx.user.id ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.absoluteExpiresAt <= new Date()
    )
      throw new UnauthorizedException("Sessionen är inte aktiv.");
  }
  private async securityAttempt<T>(
    ctx: AdminContext,
    action: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    // The counter check, failed evidence and successful mutation share one lock
    // and transaction, so multiple API instances cannot race the attempt limit.
    const outcome = await this.db.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(36036,1)`;
        try {
          await this.assertMfaRate(ctx, tx);
        } catch (error) {
          return { ok: false as const, error };
        }
        try {
          await this.requireSession(ctx, tx);
          return { ok: true as const, value: await operation(tx) };
        } catch (error) {
          if (
            error instanceof ForbiddenException ||
            error instanceof UnauthorizedException ||
            error instanceof ServiceUnavailableException
          ) {
            await this.audit(tx, ctx, action, "PLATFORM", undefined, undefined, "DENIED");
            return { ok: false as const, error };
          }
          throw error; // DB failures abort all changes; never commit partial work.
        }
      },
      { maxWait: 10000, timeout: 15000 }
    );
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
  async enroll(ctx: AdminContext) {
    const key = this.key();
    const secret = new Secret({ size: 32 });
    return this.db.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(36036,1)`;
      await this.requireSession(ctx, tx);
      const grant = await this.requireGrant(ctx.user.id, tx);
      if (grant.mustChangePassword || grant.user.mustChangePassword)
        throw new ForbiddenException("Byt lösenord först.");
      const session = await tx.session.findUnique({
        where: { id: ctx.user.sessionId },
        select: { createdAt: true, revokedAt: true }
      });
      if (!session || session.revokedAt || Date.now() - session.createdAt.getTime() > 5 * 60000)
        throw new ForbiddenException("Logga in igen innan MFA registreras.");
      const existing = await tx.platformAdminMfaCredential.findUnique({
        where: { userId: ctx.user.id },
        select: { verifiedAt: true }
      });
      if (existing?.verifiedAt)
        throw new ConflictException(
          "MFA är redan registrerat. Använd den säkra återställningsprocessen."
        );
      const data = {
        encryptedSecret: encryptMfaSecret(secret.base32, key, ctx.user.id, this.keyId()),
        keyId: this.keyId(),
        pendingExpiresAt: new Date(Date.now() + 10 * 60000),
        lastUsedCounter: BigInt(-1)
      };
      await tx.platformAdminMfaCredential.upsert({
        where: { userId: ctx.user.id },
        create: { userId: ctx.user.id, ...data },
        update: data
      });
      await this.audit(tx, ctx, "ADMIN_MFA_ENROLLMENT_STARTED", "USER", ctx.user.id);
      const totp = new TOTP({
        issuer: "LedgerApp",
        label: ctx.user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret
      });
      // This one-time, authenticated enrollment response is the ONLY secret disclosure.
      return { secret: secret.base32, uri: totp.toString(), expiresInSeconds: 600 };
    });
  }
  async verifyMfa(ctx: AdminContext, code: string, currentPassword: string) {
    const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(16).toString("hex"));
    try {
      return await this.securityAttempt(ctx, "ADMIN_MFA_FAILED", async (tx) => {
        const grant = await this.requireGrant(ctx.user.id, tx);
        await this.password(tx, ctx.user.id, currentPassword);
        if (grant.mustChangePassword || grant.user.mustChangePassword)
          throw new ForbiddenException("Byt lösenord först.");
        const credential = await tx.platformAdminMfaCredential.findUnique({
          where: { userId: ctx.user.id }
        });
        if (
          !credential ||
          credential.keyId !== this.keyId() ||
          (!credential.verifiedAt && credential.pendingExpiresAt.getTime() <= Date.now())
        )
          throw new ForbiddenException("MFA-registreringen saknas eller har löpt ut.");
        const secret = decryptMfaSecret(
          credential.encryptedSecret,
          this.key(),
          ctx.user.id,
          credential.keyId
        );
        const timestamp = Date.now();
        const totp = new TOTP({
          secret: Secret.fromBase32(secret),
          algorithm: "SHA1",
          digits: 6,
          period: 30
        });
        const delta = totp.validate({ token: code, window: 1, timestamp });
        const counter = BigInt(Math.floor(timestamp / 30000) + (delta ?? 0));
        if (delta === null || counter <= credential.lastUsedCounter)
          throw new ForbiddenException("Ogiltig eller redan använd MFA-kod.");
        const session = await tx.session.findUnique({
          where: { id: ctx.user.sessionId },
          select: { userId: true, revokedAt: true, expiresAt: true }
        });
        if (
          !session ||
          session.userId !== ctx.user.id ||
          session.revokedAt ||
          session.expiresAt <= new Date()
        )
          throw new UnauthorizedException();
        await tx.platformAdminMfaCredential.update({
          where: { id: credential.id },
          data: { verifiedAt: credential.verifiedAt ?? new Date(), lastUsedCounter: counter }
        });
        await tx.session.update({
          where: { id: ctx.user.sessionId },
          data: { adminMfaVerifiedAt: new Date() }
        });
        if (!credential.verifiedAt) {
          const hashes: string[] = [];
          for (const value of recoveryCodes) hashes.push(await hashPassword(value, this.settings));
          await tx.platformAdminRecoveryCode.updateMany({
            where: { userId: ctx.user.id, usedAt: null },
            data: { usedAt: new Date() }
          });
          await tx.platformAdminRecoveryCode.createMany({
            data: hashes.map((codeHash) => ({ userId: ctx.user.id, codeHash }))
          });
        }
        await this.audit(
          tx,
          ctx,
          credential.verifiedAt ? "ADMIN_MFA_STEP_UP" : "ADMIN_MFA_ENABLED",
          "USER",
          ctx.user.id
        );
        return { verified: true, recoveryCodes: credential.verifiedAt ? undefined : recoveryCodes };
      });
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      await this.denied(ctx, "ADMIN_MFA_DATABASE_FAILURE");
      throw new ServiceUnavailableException("MFA kunde inte verifieras säkert.");
    }
  }
  async recover(ctx: AdminContext, recoveryCode: string, currentPassword: string) {
    try {
      return await this.securityAttempt(ctx, "ADMIN_RECOVERY_FAILED", async (tx) => {
        await this.requireGrant(ctx.user.id, tx);
        await this.password(tx, ctx.user.id, currentPassword);
        const codes = await tx.platformAdminRecoveryCode.findMany({
          where: { userId: ctx.user.id, usedAt: null },
          take: 10
        });
        let match: string | undefined;
        for (const candidate of codes)
          if (await argon2.verify(candidate.codeHash, recoveryCode).catch(() => false))
            match = candidate.id;
        if (!match) throw new ForbiddenException("Återställningskoden kunde inte verifieras.");
        await tx.platformAdminRecoveryCode.updateMany({
          where: { userId: ctx.user.id, usedAt: null },
          data: { usedAt: new Date() }
        });
        await tx.platformAdminMfaCredential.update({
          where: { userId: ctx.user.id },
          data: { verifiedAt: null, pendingExpiresAt: new Date(0) }
        });
        await tx.platformAdministrator.update({
          where: { userId: ctx.user.id },
          data: { mustChangePassword: true }
        });
        await tx.user.update({ where: { id: ctx.user.id }, data: { mustChangePassword: true } });
        await tx.session.updateMany({
          where: { userId: ctx.user.id, revokedAt: null },
          data: { revokedAt: new Date(), revocationReason: "ADMIN_REVOKED" }
        });
        await this.audit(tx, ctx, "ADMIN_MFA_RECOVERED", "USER", ctx.user.id);
        return { reloginRequired: true };
      });
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof UnauthorizedException)
        throw error;
      await this.denied(ctx, "ADMIN_RECOVERY_DATABASE_FAILURE");
      throw new ServiceUnavailableException("Säker återställning kunde inte genomföras.");
    }
  }
  async changePassword(ctx: AdminContext, currentPassword: string, newPassword: string) {
    if (!validPrivilegedPassword(newPassword) || currentPassword === newPassword)
      throw new BadRequestException(
        "Nytt lösenord måste skilja sig och ha 14–128 tecken, stora/små bokstäver och siffror."
      );
    const passwordHash = await hashPassword(newPassword, this.settings);
    return this.db.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(36036,1)`;
      await this.requireSession(ctx, tx);
      await this.password(tx, ctx.user.id, currentPassword);
      const existingGrant = await tx.platformAdministrator.findUnique({
        where: { userId: ctx.user.id },
        select: {
          isActive: true,
          mustChangePassword: true,
          user: { select: { mustChangePassword: true } }
        }
      });
      if (
        existingGrant?.isActive &&
        !existingGrant.mustChangePassword &&
        !existingGrant.user.mustChangePassword
      ) {
        await this.assertAccess(ctx, "READ", tx);
        const session = await tx.session.findUnique({
          where: { id: ctx.user.sessionId },
          select: { adminMfaVerifiedAt: true }
        });
        if (
          !session?.adminMfaVerifiedAt ||
          Date.now() - session.adminMfaVerifiedAt.getTime() > 5 * 60000
        )
          throw new ForbiddenException("Lösenordsbyte kräver aktuell MFA step-up.");
      }
      await tx.user.update({
        where: { id: ctx.user.id },
        data: { passwordHash, mustChangePassword: false }
      });
      await tx.platformAdministrator.updateMany({
        where: { userId: ctx.user.id },
        data: { mustChangePassword: false }
      });
      await tx.session.updateMany({
        where: { userId: ctx.user.id, revokedAt: null },
        data: { revokedAt: new Date(), revocationReason: "PASSWORD_CHANGED" }
      });
      await this.audit(tx, ctx, "PASSWORD_CHANGED", "USER", ctx.user.id);
      return { reloginRequired: true };
    });
  }
}

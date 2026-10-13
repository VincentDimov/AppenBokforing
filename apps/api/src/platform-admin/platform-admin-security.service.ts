import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Prisma } from "@ledgerapp/db";
import argon2 from "argon2";
import { DatabaseService } from "../database/database.service";
import { AuthSettingsService } from "../auth/auth-settings.service";
import type { AuthenticatedUser } from "../auth/auth.types";
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
    private readonly settings: AuthSettingsService
  ) {}

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
        user: { select: { isActive: true, mustChangePassword: true } }
      }
    });
    if (!grant?.isActive || grant.revokedAt || !grant.user.isActive)
      throw new ForbiddenException("Du saknar plattformsbehörighet.");
    return grant;
  }
  async state(userId: string) {
    const grant = await this.requireGrant(userId);
    return {
      role: grant.role,
      mustChangePassword: grant.mustChangePassword || grant.user.mustChangePassword,
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
    // Session and grant validation remain mandatory, including inside write transactions.
    // Historical MFA fields/credentials do not authorize or block any operation.
    const session = await tx.session.findUnique({
      where: { id: ctx.user.sessionId },
      select: { userId: true, revokedAt: true, expiresAt: true, absoluteExpiresAt: true }
    });
    this.assertSession(ctx, session);
    return grant;
  }
  private assertSession(
    ctx: AdminContext,
    session: {
      userId: string;
      revokedAt: Date | null;
      expiresAt: Date;
      absoluteExpiresAt: Date;
    } | null
  ) {
    const now = Date.now();
    if (
      !session ||
      session.userId !== ctx.user.id ||
      session.revokedAt ||
      session.expiresAt.getTime() <= now ||
      session.absoluteExpiresAt.getTime() <= now
    )
      throw new UnauthorizedException("Sessionen är inte aktiv.");
  }
  private async password(tx: Prisma.TransactionClient, userId: string, password: string) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, isActive: true }
    });
    if (
      !user?.isActive ||
      !user.passwordHash ||
      !(await argon2.verify(user.passwordHash, password).catch(() => false))
    )
      throw new ForbiddenException("Lösenordet kunde inte verifieras.");
  }
  private async requireSession(ctx: AdminContext, tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT id FROM sessions WHERE id=${ctx.user.sessionId}::uuid FOR UPDATE`;
    const session = await tx.session.findUnique({
      where: { id: ctx.user.sessionId },
      select: { userId: true, revokedAt: true, expiresAt: true, absoluteExpiresAt: true }
    });
    this.assertSession(ctx, session);
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

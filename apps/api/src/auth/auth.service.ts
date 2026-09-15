import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, SessionRevocationReason } from "@ledgerapp/db";
import argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";

import { DatabaseService } from "../database/database.service";
import { AuthSettingsService } from "./auth-settings.service";
import type {
  AccessTokenPayload,
  AuthResult,
  AuthTokens,
  AuthResponse,
  AuthenticatedUser,
  RequestMetadata
} from "./auth.types";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SessionBundle {
  session: {
    absoluteExpiresAt: Date;
    expiresAt: Date;
    familyId: string;
    id: string;
    ipAddress: string | null;
    lastSeenAt: Date;
    refreshTokenHash: string;
    userAgent: string | null;
    userId: string;
  };
  tokens: AuthTokens;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly settings: AuthSettingsService
  ) {}

  async register(dto: RegisterDto, metadata: RequestMetadata): Promise<AuthResult> {
    const userId = randomUUID();
    const passwordHash = await this.hash(dto.password);
    const sessionBundle = await this.createSessionBundle(userId, metadata);

    try {
      const user = await this.database.prisma.$transaction(async (transaction) => {
        const createdUser = await transaction.user.create({
          data: {
            id: userId,
            displayName: dto.displayName,
            email: dto.email,
            passwordHash
          }
        });

        await transaction.session.create({
          data: sessionBundle.session
        });

        return createdUser;
      });

      return {
        tokens: sessionBundle.tokens,
        user: this.toPublicUser(user)
      };
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException("An account with that email address already exists.");
      }

      throw error;
    }
  }

  async login(dto: LoginDto, metadata: RequestMetadata): Promise<AuthResult> {
    const user = await this.database.prisma.user.findUnique({
      where: { email: dto.email }
    });

    const passwordIsValid = user?.passwordHash
      ? await this.verify(dto.password, user.passwordHash)
      : false;

    if (!user || !passwordIsValid || !user.isActive) {
      if (!user?.passwordHash) {
        await this.hash(dto.password);
      }

      throw this.invalidCredentials();
    }

    const sessionBundle = await this.createSessionBundle(user.id, metadata);

    await this.database.prisma.$transaction([
      this.database.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      }),
      this.database.prisma.session.create({
        data: sessionBundle.session
      })
    ]);

    return {
      tokens: sessionBundle.tokens,
      user: this.toPublicUser(user)
    };
  }

  async refresh(refreshToken: string | undefined, metadata: RequestMetadata): Promise<AuthResult> {
    const parsedToken = this.parseRefreshToken(refreshToken);

    if (!parsedToken) {
      throw this.invalidRefreshToken();
    }

    const session = await this.database.prisma.session.findUnique({
      where: { id: parsedToken.sessionId },
      include: { user: true }
    });

    if (!session || !session.user.isActive || session.expiresAt <= new Date()) {
      throw this.invalidRefreshToken();
    }

    if (session.revokedAt) {
      if (session.revocationReason === SessionRevocationReason.ROTATED) {
        await this.revokeSessionFamily(session.familyId, SessionRevocationReason.REUSE_DETECTED);
      }

      throw this.invalidRefreshToken();
    }

    if (!(await this.verifyRefreshToken(refreshToken, session.refreshTokenHash))) {
      await this.revokeSessionFamily(session.familyId, SessionRevocationReason.REUSE_DETECTED);
      throw this.invalidRefreshToken();
    }

    const sessionBundle = await this.createSessionBundle(session.userId, metadata, {
      absoluteExpiresAt: session.absoluteExpiresAt,
      familyId: session.familyId
    });
    const rotatedAt = new Date();
    const rotated = await this.database.prisma.$transaction(async (transaction) => {
      // The old session's replacedById has a real foreign key. Insert the child
      // first, then atomically claim and revoke the presented session below.
      await transaction.session.create({
        data: sessionBundle.session
      });

      const replaced = await transaction.session.updateMany({
        where: {
          id: session.id,
          refreshTokenHash: session.refreshTokenHash,
          revokedAt: null
        },
        data: {
          lastSeenAt: rotatedAt,
          replacedById: sessionBundle.session.id,
          revocationReason: SessionRevocationReason.ROTATED,
          revokedAt: rotatedAt
        }
      });

      if (replaced.count !== 1) {
        await transaction.session.updateMany({
          where: {
            familyId: session.familyId,
            revokedAt: null
          },
          data: {
            revocationReason: SessionRevocationReason.REUSE_DETECTED,
            revokedAt: rotatedAt
          }
        });

        return false;
      }

      return true;
    });

    if (!rotated) {
      throw this.invalidRefreshToken();
    }

    return {
      tokens: sessionBundle.tokens,
      user: this.toPublicUser(session.user)
    };
  }

  async logout(refreshToken: string | undefined, accessToken: string | undefined): Promise<void> {
    const refreshSession = await this.getRefreshSession(refreshToken);

    if (refreshSession) {
      await this.revokeSessionFamily(refreshSession.familyId, SessionRevocationReason.LOGOUT);
      return;
    }

    const accessPayload = await this.tryVerifyAccessToken(accessToken);

    if (!accessPayload) {
      return;
    }

    const accessSession = await this.database.prisma.session.findUnique({
      where: { id: accessPayload.sid }
    });

    if (accessSession && accessSession.userId === accessPayload.sub) {
      await this.revokeSessionFamily(accessSession.familyId, SessionRevocationReason.LOGOUT);
    }
  }

  async authenticateAccessToken(accessToken: string | undefined): Promise<AuthenticatedUser> {
    const payload = await this.tryVerifyAccessToken(accessToken);

    if (!payload) {
      throw new UnauthorizedException("Authentication is required.");
    }

    const session = await this.database.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true }
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.isActive
    ) {
      throw new UnauthorizedException("Authentication is required.");
    }

    return {
      displayName: session.user.displayName,
      email: session.user.email,
      id: session.user.id,
      sessionId: session.id
    };
  }

  setAuthCookies(response: AuthResponse, tokens: AuthTokens): void {
    const now = Date.now();

    response.cookie(this.settings.accessCookieName, tokens.accessToken, {
      ...this.settings.cookieOptions,
      maxAge: Math.max(0, tokens.accessExpiresAt.getTime() - now)
    });
    response.cookie(this.settings.refreshCookieName, tokens.refreshToken, {
      ...this.settings.cookieOptions,
      maxAge: Math.max(0, tokens.refreshExpiresAt.getTime() - now)
    });
  }

  clearAuthCookies(response: AuthResponse): void {
    response.clearCookie(this.settings.accessCookieName, this.settings.cookieOptions);
    response.clearCookie(this.settings.refreshCookieName, this.settings.cookieOptions);
  }

  extractAccessToken(
    cookies: Record<string, string | undefined> | undefined,
    authorizationHeader: string | undefined
  ): string | undefined {
    const bearerToken = this.extractBearerToken(authorizationHeader);

    return bearerToken ?? cookies?.[this.settings.accessCookieName];
  }

  private async createSessionBundle(
    userId: string,
    metadata: RequestMetadata,
    context?: { absoluteExpiresAt: Date; familyId: string }
  ): Promise<SessionBundle> {
    const now = new Date();
    const absoluteExpiresAt =
      context?.absoluteExpiresAt ??
      new Date(now.getTime() + this.settings.refreshAbsoluteTtlSeconds * 1_000);
    const expiresAt = new Date(
      Math.min(
        now.getTime() + this.settings.refreshTokenTtlSeconds * 1_000,
        absoluteExpiresAt.getTime()
      )
    );

    if (expiresAt <= now) {
      throw this.invalidRefreshToken();
    }

    const sessionId = randomUUID();
    const refreshToken = sessionId + "." + randomBytes(48).toString("base64url");
    const refreshTokenHash = await this.hashRefreshToken(refreshToken);
    const accessToken = await this.jwtService.signAsync(
      {
        sid: sessionId,
        sub: userId,
        typ: "access"
      },
      {
        audience: this.settings.audience,
        expiresIn: this.settings.accessTokenTtlSeconds,
        issuer: this.settings.issuer,
        secret: this.settings.accessTokenSecret
      }
    );

    return {
      session: {
        absoluteExpiresAt,
        expiresAt,
        familyId: context?.familyId ?? randomUUID(),
        id: sessionId,
        ipAddress: metadata.ipAddress ?? null,
        lastSeenAt: now,
        refreshTokenHash,
        userAgent: metadata.userAgent ?? null,
        userId
      },
      tokens: {
        accessExpiresAt: new Date(now.getTime() + this.settings.accessTokenTtlSeconds * 1_000),
        accessToken,
        refreshExpiresAt: expiresAt,
        refreshToken
      }
    };
  }

  private async getRefreshSession(refreshToken: string | undefined) {
    const parsedToken = this.parseRefreshToken(refreshToken);

    if (!parsedToken) {
      return null;
    }

    const session = await this.database.prisma.session.findUnique({
      where: { id: parsedToken.sessionId }
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      return null;
    }

    return (await this.verifyRefreshToken(refreshToken, session.refreshTokenHash)) ? session : null;
  }

  private async revokeSessionFamily(
    familyId: string,
    reason: SessionRevocationReason
  ): Promise<void> {
    await this.database.prisma.session.updateMany({
      where: {
        familyId,
        revokedAt: null
      },
      data: {
        revocationReason: reason,
        revokedAt: new Date()
      }
    });
  }

  private async tryVerifyAccessToken(
    accessToken: string | undefined
  ): Promise<AccessTokenPayload | null> {
    if (!accessToken) {
      return null;
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(accessToken, {
        audience: this.settings.audience,
        issuer: this.settings.issuer,
        secret: this.settings.accessTokenSecret
      });

      return payload.typ === "access" &&
        typeof payload.sub === "string" &&
        typeof payload.sid === "string"
        ? payload
        : null;
    } catch {
      return null;
    }
  }

  private async hash(passwordOrToken: string): Promise<string> {
    return argon2.hash(passwordOrToken, {
      memoryCost: this.settings.argon2MemoryCost,
      parallelism: this.settings.argon2Parallelism,
      timeCost: this.settings.argon2TimeCost,
      type: argon2.argon2id
    });
  }

  private async hashRefreshToken(refreshToken: string): Promise<string> {
    return this.hash(refreshToken + "." + this.settings.refreshTokenPepper);
  }

  private async verify(passwordOrToken: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, passwordOrToken);
    } catch {
      return false;
    }
  }

  private async verifyRefreshToken(
    refreshToken: string | undefined,
    hash: string
  ): Promise<boolean> {
    return refreshToken
      ? this.verify(refreshToken + "." + this.settings.refreshTokenPepper, hash)
      : false;
  }

  private parseRefreshToken(refreshToken: string | undefined): { sessionId: string } | null {
    if (!refreshToken) {
      return null;
    }

    const separatorIndex = refreshToken.indexOf(".");
    const sessionId = refreshToken.slice(0, separatorIndex);
    const tokenSecret = refreshToken.slice(separatorIndex + 1);

    if (separatorIndex < 1 || !UUID_PATTERN.test(sessionId) || tokenSecret.length < 32) {
      return null;
    }

    return { sessionId };
  }

  private extractBearerToken(authorizationHeader: string | undefined): string | undefined {
    if (!authorizationHeader) {
      return undefined;
    }

    const [scheme, token] = authorizationHeader.split(" ");

    return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
  }

  private toPublicUser(user: {
    displayName: string;
    email: string;
    id: string;
  }): Omit<AuthenticatedUser, "sessionId"> {
    return {
      displayName: user.displayName,
      email: user.email,
      id: user.id
    };
  }

  private isUniqueConstraint(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException("Invalid email or password.");
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException("Your session is invalid or has expired.");
  }
}

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AuthCookieOptions } from "./auth.types";

@Injectable()
export class AuthSettingsService {
  readonly accessTokenSecret: string;
  readonly refreshTokenPepper: string;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
  readonly refreshAbsoluteTtlSeconds: number;
  readonly issuer: string;
  readonly audience: string;
  readonly argon2MemoryCost: number;
  readonly argon2Parallelism: number;
  readonly argon2TimeCost: number;
  readonly isProduction: boolean;

  constructor(configService: ConfigService) {
    this.isProduction = configService.get<string>("NODE_ENV") === "production";
    this.accessTokenSecret = this.getRequiredSecret(configService, "JWT_ACCESS_SECRET");
    this.refreshTokenPepper = this.getRequiredSecret(configService, "JWT_REFRESH_SECRET");
    this.accessTokenTtlSeconds = this.getPositiveInteger(
      configService,
      "JWT_ACCESS_TTL_SECONDS",
      15 * 60
    );
    this.refreshTokenTtlSeconds = this.getPositiveInteger(
      configService,
      "REFRESH_TOKEN_TTL_SECONDS",
      7 * 24 * 60 * 60
    );
    this.refreshAbsoluteTtlSeconds = this.getPositiveInteger(
      configService,
      "REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS",
      30 * 24 * 60 * 60
    );
    this.issuer = configService.get<string>("JWT_ISSUER")?.trim() || "ledgerapp-api";
    this.audience = configService.get<string>("JWT_AUDIENCE")?.trim() || "ledgerapp-web";
    this.argon2MemoryCost = this.getPositiveInteger(configService, "ARGON2_MEMORY_COST", 65_536);
    this.argon2Parallelism = this.getPositiveInteger(configService, "ARGON2_PARALLELISM", 1);
    this.argon2TimeCost = this.getPositiveInteger(configService, "ARGON2_TIME_COST", 3);

    if (this.refreshAbsoluteTtlSeconds < this.refreshTokenTtlSeconds) {
      throw new Error(
        "REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS must not be shorter than the refresh TTL."
      );
    }

    if (this.argon2TimeCost < 2 || this.argon2MemoryCost < 8 * this.argon2Parallelism) {
      throw new Error(
        "Argon2id settings must use time cost >= 2 and enough memory for parallelism."
      );
    }

    if (this.isProduction && (this.argon2MemoryCost < 65_536 || this.argon2TimeCost < 3)) {
      throw new Error(
        "Production Argon2id settings must use at least 65536 KiB and three iterations."
      );
    }
  }

  get accessCookieName(): string {
    return this.isProduction ? "__Host-ledgerapp_access" : "ledgerapp_access";
  }

  get refreshCookieName(): string {
    return this.isProduction ? "__Host-ledgerapp_refresh" : "ledgerapp_refresh";
  }

  get cookieOptions(): AuthCookieOptions {
    return {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: this.isProduction
    };
  }

  private getRequiredSecret(configService: ConfigService, name: string): string {
    const value = configService.get<string>(name)?.trim();

    if (!value || value.length < 32) {
      throw new Error(name + " must contain at least 32 characters.");
    }

    return value;
  }

  private getPositiveInteger(configService: ConfigService, name: string, fallback: number): number {
    const value = configService.get<string>(name);

    if (value === undefined || value.trim() === "") {
      return fallback;
    }

    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(name + " must be a positive integer.");
    }

    return parsed;
  }
}

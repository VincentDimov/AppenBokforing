import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { PlatformAdminSecurityService, type AdminContext } from "./platform-admin-security.service";
import { PLATFORM_PERMISSION_KEY, type PlatformPermission } from "./platform-admin.permissions";

export function adminContext(request: AuthenticatedRequest): AdminContext {
  if (!request.auth) throw new UnauthorizedException("Authentication required");
  const ip = request.ip;
  return {
    user: request.auth,
    requestId: request.header("x-request-id"),
    ipMetadata: ip?.includes(":") ? "IPv6 (masked)" : ip?.replace(/\.\d+$/, ".0/24")
  };
}
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly security: PlatformAdminSecurityService,
    private readonly reflector: Reflector
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const ctx = adminContext(request);
    const permission =
      this.reflector.getAllAndOverride<PlatformPermission>(PLATFORM_PERMISSION_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? "READ";
    try {
      await this.security.assertAccess(ctx, permission);
      return true;
    } catch (error) {
      await this.security.denied(ctx, "PLATFORM_ACCESS_DENIED");
      throw error;
    }
  }
}

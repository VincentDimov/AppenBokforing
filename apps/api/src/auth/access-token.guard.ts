import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AuthService } from "./auth.service";
import type { AuthenticatedRequest } from "./auth.types";
import { IS_PUBLIC_KEY } from "./decorators/public.decorator";

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = this.authService.extractAccessToken(
      request.cookies as Record<string, string | undefined> | undefined,
      request.header("authorization")
    );

    if (!accessToken) {
      throw new UnauthorizedException("Authentication is required.");
    }

    request.auth = await this.authService.authenticateAccessToken(accessToken);

    return true;
  }
}

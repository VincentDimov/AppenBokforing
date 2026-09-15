import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { AuthSettingsService } from "./auth-settings.service";
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
  AuthResponse,
  RequestMetadata
} from "./auth.types";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly settings: AuthSettingsService
  ) {}

  @Post("register")
  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({ summary: "Create an account and an authenticated session" })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: AuthResponse
  ) {
    const result = await this.authService.register(dto, this.getRequestMetadata(request));

    this.authService.setAuthCookies(response, result.tokens);

    return { user: result.user };
  }

  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Authenticate with email and password" })
  async login(
    @Body() dto: LoginDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: AuthResponse
  ) {
    const result = await this.authService.login(dto, this.getRequestMetadata(request));

    this.authService.setAuthCookies(response, result.tokens);

    return { user: result.user };
  }

  @Post("refresh")
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: "Rotate an authenticated refresh session" })
  async refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: AuthResponse
  ) {
    try {
      const result = await this.authService.refresh(
        request.cookies?.[this.settings.refreshCookieName],
        this.getRequestMetadata(request)
      );

      this.authService.setAuthCookies(response, result.tokens);

      return { user: result.user };
    } catch (error) {
      this.authService.clearAuthCookies(response);
      throw error;
    }
  }

  @Post("logout")
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke the active session family and clear auth cookies" })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: AuthResponse
  ): Promise<void> {
    await this.authService.logout(
      request.cookies?.[this.settings.refreshCookieName],
      this.authService.extractAccessToken(
        request.cookies as Record<string, string | undefined> | undefined,
        request.header("authorization")
      )
    );
    this.authService.clearAuthCookies(response);
  }

  @Get("me")
  @ApiCookieAuth("ledgerapp_access")
  @ApiOperation({ summary: "Return the authenticated user" })
  me(@CurrentUser() user: AuthenticatedUser | undefined) {
    if (!user) {
      throw new UnauthorizedException("Authentication is required.");
    }

    return {
      user: {
        displayName: user.displayName,
        email: user.email,
        id: user.id
      }
    };
  }

  private getRequestMetadata(request: AuthenticatedRequest): RequestMetadata {
    return {
      ipAddress: request.ip?.slice(0, 64),
      userAgent: request.header("user-agent")?.slice(0, 512)
    };
  }
}

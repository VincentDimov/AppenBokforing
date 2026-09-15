import type { OrganizationMemberRole } from "@ledgerapp/db";

export interface AuthCookieOptions {
  httpOnly: boolean;
  maxAge?: number;
  path: string;
  sameSite: "lax";
  secure: boolean;
}

export interface AuthResponse {
  clearCookie(name: string, options: AuthCookieOptions): this;
  cookie(name: string, value: string, options: AuthCookieOptions): this;
}

export interface HttpRequest {
  body?: Record<string, unknown>;
  cookies?: Record<string, string | undefined>;
  header(name: string): string | undefined;
  ip?: string;
  method?: string;
  params: Record<string, string | undefined>;
  query?: Record<string, string | string[] | undefined>;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  sessionId: string;
}

export interface AuthenticatedRequest extends HttpRequest {
  auth?: AuthenticatedUser;
  organizationMembership?: {
    id: string;
    organizationId: string;
    role: OrganizationMemberRole;
  };
}

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthTokens {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AuthResult {
  tokens: AuthTokens;
  user: Omit<AuthenticatedUser, "sessionId">;
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  typ: "access";
  iat?: number;
  exp?: number;
}

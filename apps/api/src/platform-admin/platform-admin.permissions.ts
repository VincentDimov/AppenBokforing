import type { PlatformAdminRole } from "@ledgerapp/db";
import { SetMetadata } from "@nestjs/common";

export type PlatformPermission = "READ" | "WRITE" | "GRANTS";
export const PLATFORM_PERMISSION_KEY = "ledgerapp.platformPermission";
export const RequirePlatformPermission = (permission: PlatformPermission) =>
  SetMetadata(PLATFORM_PERMISSION_KEY, permission);
export function hasPlatformPermission(role: PlatformAdminRole, permission: PlatformPermission) {
  if (role === "SUPER_ADMIN") return true;
  if (role === "PLATFORM_ADMIN") return permission !== "GRANTS";
  return (role === "SUPPORT_ADMIN" || role === "PLATFORM_VIEWER") && permission === "READ";
}

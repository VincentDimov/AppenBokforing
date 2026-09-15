import { OrganizationMemberRole } from "@ledgerapp/db";

export const ORGANIZATION_PERMISSIONS = [
  "VIEW_ORGANIZATION",
  "UPDATE_ORGANIZATION",
  "MANAGE_MEMBERS",
  "READ_BOOKKEEPING",
  "CREATE_BOOKKEEPING",
  "MANAGE_ACCOUNTS",
  "EXPORT_BOOKKEEPING"
] as const;

export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Readonly<
  Record<OrganizationMemberRole, readonly OrganizationPermission[]>
> = {
  [OrganizationMemberRole.OWNER]: ORGANIZATION_PERMISSIONS,
  [OrganizationMemberRole.ADMIN]: [
    "VIEW_ORGANIZATION",
    "UPDATE_ORGANIZATION",
    "MANAGE_MEMBERS",
    "READ_BOOKKEEPING",
    "CREATE_BOOKKEEPING",
    "MANAGE_ACCOUNTS",
    "EXPORT_BOOKKEEPING"
  ],
  [OrganizationMemberRole.ACCOUNTANT]: [
    "VIEW_ORGANIZATION",
    "READ_BOOKKEEPING",
    "CREATE_BOOKKEEPING",
    "MANAGE_ACCOUNTS",
    "EXPORT_BOOKKEEPING"
  ],
  [OrganizationMemberRole.MEMBER]: ["VIEW_ORGANIZATION", "READ_BOOKKEEPING"],
  [OrganizationMemberRole.READ_ONLY]: ["VIEW_ORGANIZATION", "READ_BOOKKEEPING"]
};

export function hasOrganizationPermission(
  role: OrganizationMemberRole,
  permission: OrganizationPermission
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasEveryOrganizationPermission(
  role: OrganizationMemberRole,
  permissions: readonly OrganizationPermission[]
): boolean {
  return permissions.every((permission) => hasOrganizationPermission(role, permission));
}

export function canManageOrganization(role: OrganizationMemberRole): boolean {
  return hasOrganizationPermission(role, "UPDATE_ORGANIZATION");
}

export { ROLE_PERMISSIONS };

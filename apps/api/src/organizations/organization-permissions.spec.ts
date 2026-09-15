import { OrganizationMemberRole } from "@ledgerapp/db";

import {
  ORGANIZATION_PERMISSIONS,
  canManageOrganization,
  hasOrganizationPermission
} from "./organization-permissions";

describe("organization permissions", () => {
  it("keeps organization administration with owners and admins", () => {
    expect(canManageOrganization(OrganizationMemberRole.OWNER)).toBe(true);
    expect(canManageOrganization(OrganizationMemberRole.ADMIN)).toBe(true);
    expect(canManageOrganization(OrganizationMemberRole.ACCOUNTANT)).toBe(false);
    expect(canManageOrganization(OrganizationMemberRole.MEMBER)).toBe(false);
    expect(canManageOrganization(OrganizationMemberRole.READ_ONLY)).toBe(false);
  });

  it("gives every membership role organization visibility", () => {
    for (const role of Object.values(OrganizationMemberRole)) {
      expect(hasOrganizationPermission(role, "VIEW_ORGANIZATION")).toBe(true);
    }

    expect(ORGANIZATION_PERMISSIONS).toContain("CREATE_BOOKKEEPING");
  });

  it("allows an accountant, but not a read-only member, to manage accounts", () => {
    expect(hasOrganizationPermission(OrganizationMemberRole.ACCOUNTANT, "MANAGE_ACCOUNTS")).toBe(
      true
    );
    expect(hasOrganizationPermission(OrganizationMemberRole.READ_ONLY, "MANAGE_ACCOUNTS")).toBe(
      false
    );
  });
});

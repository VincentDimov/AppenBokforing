import { SetMetadata } from "@nestjs/common";

import type { OrganizationPermission } from "../organization-permissions";

export const ORGANIZATION_PERMISSIONS_KEY = "ledgerapp:organization-permissions";

export const RequireOrganizationPermission = (...permissions: OrganizationPermission[]) =>
  SetMetadata(ORGANIZATION_PERMISSIONS_KEY, permissions);

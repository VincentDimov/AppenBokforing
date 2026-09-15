import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { OrganizationMemberRole } from "@ledgerapp/db";

import { DatabaseService } from "../database/database.service";
import {
  hasEveryOrganizationPermission,
  type OrganizationPermission
} from "../organizations/organization-permissions";

export interface AccountOrganizationMembership {
  id: string;
  organizationId: string;
  role: OrganizationMemberRole;
}

@Injectable()
export class AccountsAccessService {
  constructor(private readonly database: DatabaseService) {}

  async requireMembership(
    userId: string,
    organizationId: string,
    permissions: readonly OrganizationPermission[]
  ): Promise<AccountOrganizationMembership> {
    const membership = await this.database.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId
        }
      }
    });

    if (!membership) {
      // Match the existing organization behavior and do not turn an ID into an oracle.
      throw new NotFoundException("Organization not found.");
    }

    if (!hasEveryOrganizationPermission(membership.role, permissions)) {
      throw new ForbiddenException("You do not have permission to manage accounts.");
    }

    return membership;
  }
}

import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { OrganizationMemberRole } from "@ledgerapp/db";

import { DatabaseService } from "../database/database.service";
import {
  hasEveryOrganizationPermission,
  type OrganizationPermission
} from "../organizations/organization-permissions";

export interface JournalEntriesOrganizationMembership {
  id: string;
  organizationId: string;
  role: OrganizationMemberRole;
}

@Injectable()
export class JournalEntriesAccessService {
  constructor(private readonly database: DatabaseService) {}

  async requireMembership(
    userId: string,
    organizationId: string,
    permissions: readonly OrganizationPermission[]
  ): Promise<JournalEntriesOrganizationMembership> {
    const membership = await this.database.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId
        }
      }
    });

    if (!membership) {
      // Keep foreign organization and resource IDs non-enumerable to callers.
      throw new NotFoundException("Organization not found.");
    }

    if (!hasEveryOrganizationPermission(membership.role, permissions)) {
      throw new ForbiddenException("You do not have permission to manage journal entries.");
    }

    return membership;
  }
}

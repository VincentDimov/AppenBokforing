import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { DatabaseService } from "../database/database.service";
import type { AuthenticatedRequest } from "../auth/auth.types";
import {
  hasEveryOrganizationPermission,
  type OrganizationPermission
} from "./organization-permissions";
import { ORGANIZATION_PERMISSIONS_KEY } from "./decorators/require-organization-permission.decorator";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolves the membership for the route's :id organization and deliberately
 * returns 404 to non-members so organization identifiers cannot be enumerated.
 */
@Injectable()
export class OrganizationMembershipGuard implements CanActivate {
  constructor(
    private readonly database: DatabaseService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const organizationId = request.params.id;

    if (!request.auth) {
      // The global access-token guard runs before this guard. Keep this defensive
      // check in case the guard is reused in a different module later.
      throw new ForbiddenException("Authentication is required.");
    }

    if (!organizationId || !UUID_PATTERN.test(organizationId)) {
      throw new NotFoundException("Organization not found.");
    }

    const membership = await this.database.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: request.auth.id
        }
      }
    });

    if (!membership) {
      throw new NotFoundException("Organization not found.");
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<OrganizationPermission[]>(ORGANIZATION_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? [];

    if (!hasEveryOrganizationPermission(membership.role, requiredPermissions)) {
      throw new ForbiddenException("You do not have permission to modify this organization.");
    }

    request.organizationMembership = {
      id: membership.id,
      organizationId: membership.organizationId,
      role: membership.role
    };

    return true;
  }
}

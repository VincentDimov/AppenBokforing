import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { DatabaseService } from "../database/database.service";
import { ORGANIZATION_PERMISSIONS_KEY } from "../organizations/decorators/require-organization-permission.decorator";
import type { OrganizationPermission } from "../organizations/organization-permissions";
import { JournalEntriesAccessService } from "./journal-entries-access.service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolves the entry tenant before reads and mutations, hiding foreign IDs. */
@Injectable()
export class JournalEntryResourceGuard implements CanActivate {
  constructor(
    private readonly access: JournalEntriesAccessService,
    private readonly database: DatabaseService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.auth) {
      throw new ForbiddenException("Authentication is required.");
    }

    const entryId = request.params.id;

    if (!entryId || !UUID_PATTERN.test(entryId)) {
      throw new NotFoundException("Journal entry not found.");
    }

    const entry = await this.database.prisma.journalEntry.findUnique({
      select: { organizationId: true },
      where: { id: entryId }
    });

    if (!entry) {
      throw new NotFoundException("Journal entry not found.");
    }

    const membership = await this.access.requireMembership(
      request.auth.id,
      entry.organizationId,
      this.getRequiredPermissions(context)
    );

    request.organizationMembership = membership;
    return true;
  }

  private getRequiredPermissions(context: ExecutionContext): OrganizationPermission[] {
    return (
      this.reflector.getAllAndOverride<OrganizationPermission[]>(ORGANIZATION_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? []
    );
  }
}

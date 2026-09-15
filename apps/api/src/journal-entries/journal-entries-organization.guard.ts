import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { ORGANIZATION_PERMISSIONS_KEY } from "../organizations/decorators/require-organization-permission.decorator";
import type { OrganizationPermission } from "../organizations/organization-permissions";
import { JournalEntriesAccessService } from "./journal-entries-access.service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolves the tenant from a journal-entry list/options query or create body. */
@Injectable()
export class JournalEntriesOrganizationGuard implements CanActivate {
  constructor(
    private readonly access: JournalEntriesAccessService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.auth) {
      throw new ForbiddenException("Authentication is required.");
    }

    const organizationId = this.getOrganizationId(request);

    if (!organizationId || !UUID_PATTERN.test(organizationId)) {
      throw new BadRequestException("organizationId must be a UUID.");
    }

    const membership = await this.access.requireMembership(
      request.auth.id,
      organizationId,
      this.getRequiredPermissions(context)
    );

    request.organizationMembership = membership;
    return true;
  }

  private getOrganizationId(request: AuthenticatedRequest): string | undefined {
    const candidate =
      request.method === "POST" ? request.body?.organizationId : request.query?.organizationId;

    return typeof candidate === "string" ? candidate : undefined;
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

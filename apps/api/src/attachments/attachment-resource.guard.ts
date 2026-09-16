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
import { JournalEntriesAccessService } from "../journal-entries/journal-entries-access.service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolves an attachment's tenant before a signed URL is issued. */
@Injectable()
export class AttachmentResourceGuard implements CanActivate {
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

    const attachmentId = request.params.id;

    if (!attachmentId || !UUID_PATTERN.test(attachmentId)) {
      throw new NotFoundException("Attachment not found.");
    }

    const attachment = await this.database.prisma.attachment.findUnique({
      select: { organizationId: true },
      where: { id: attachmentId }
    });

    if (!attachment) {
      throw new NotFoundException("Attachment not found.");
    }

    request.organizationMembership = await this.access.requireMembership(
      request.auth.id,
      attachment.organizationId,
      this.getRequiredPermissions(context)
    );
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

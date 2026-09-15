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
import { AccountsAccessService } from "./accounts-access.service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolves an account's tenant before read/update so a foreign account remains invisible. */
@Injectable()
export class AccountResourceGuard implements CanActivate {
  constructor(
    private readonly access: AccountsAccessService,
    private readonly database: DatabaseService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.auth) {
      throw new ForbiddenException("Authentication is required.");
    }

    const accountId = request.params.id;

    if (!accountId || !UUID_PATTERN.test(accountId)) {
      throw new NotFoundException("Account not found.");
    }

    const account = await this.database.prisma.account.findUnique({
      select: { organizationId: true },
      where: { id: accountId }
    });

    if (!account) {
      throw new NotFoundException("Account not found.");
    }

    const membership = await this.access.requireMembership(
      request.auth.id,
      account.organizationId,
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

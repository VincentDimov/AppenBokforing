import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";

import type { AuthenticatedRequest, AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequireOrganizationPermission } from "../organizations/decorators/require-organization-permission.decorator";
import { AccountResourceGuard } from "./account-resource.guard";
import { AccountsOrganizationGuard } from "./accounts-organization.guard";
import { AccountsService } from "./accounts.service";
import { CreateAccountDto } from "./dto/create-account.dto";
import { ListAccountsQueryDto } from "./dto/list-accounts-query.dto";
import { UpdateAccountDto } from "./dto/update-account.dto";

@ApiTags("Accounts")
@ApiBearerAuth()
@ApiCookieAuth("ledgerapp_access")
@Controller("accounts")
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @UseGuards(AccountsOrganizationGuard)
  @RequireOrganizationPermission("READ_BOOKKEEPING")
  @ApiOperation({ summary: "List accounts in the selected organization" })
  @ApiQuery({ name: "organizationId", required: true })
  @ApiQuery({ name: "q", required: false })
  list(@Query() query: ListAccountsQueryDto, @Req() request: AuthenticatedRequest) {
    return this.accountsService.list(this.getOrganizationId(request), query);
  }

  @Get(":id")
  @UseGuards(AccountResourceGuard)
  @RequireOrganizationPermission("READ_BOOKKEEPING")
  @ApiOperation({ summary: "Get an account after tenant membership verification" })
  getOne(@Param("id") accountId: string, @Req() request: AuthenticatedRequest) {
    return this.accountsService.findOne(this.getOrganizationId(request), accountId);
  }

  @Post()
  @UseGuards(AccountsOrganizationGuard)
  @RequireOrganizationPermission("MANAGE_ACCOUNTS")
  @ApiOperation({ summary: "Create an organization-scoped account" })
  create(
    @Body() dto: CreateAccountDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest
  ) {
    return this.accountsService.create(
      this.getOrganizationId(request),
      user.id,
      dto,
      this.getAuditMetadata(request)
    );
  }

  @Patch(":id")
  @UseGuards(AccountResourceGuard)
  @RequireOrganizationPermission("MANAGE_ACCOUNTS")
  @ApiOperation({ summary: "Update an organization-scoped account" })
  update(
    @Param("id") accountId: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest
  ) {
    return this.accountsService.update(
      this.getOrganizationId(request),
      accountId,
      user.id,
      dto,
      this.getAuditMetadata(request)
    );
  }

  private getOrganizationId(request: AuthenticatedRequest): string {
    const organizationId = request.organizationMembership?.organizationId;

    if (!organizationId) {
      throw new Error("Account routes require an organization membership context.");
    }

    return organizationId;
  }

  private getAuditMetadata(request: AuthenticatedRequest) {
    const requestId = request.header("x-request-id")?.slice(0, 100);

    return {
      ipAddress: request.ip?.slice(0, 64),
      requestId
    };
  }
}

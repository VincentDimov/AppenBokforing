import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";

import type { AuthenticatedRequest, AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequireOrganizationPermission } from "../organizations/decorators/require-organization-permission.decorator";
import { CreateJournalEntryDto } from "./dto/create-journal-entry.dto";
import { JournalEntryOptionsQueryDto } from "./dto/journal-entry-options-query.dto";
import { ListJournalEntriesQueryDto } from "./dto/list-journal-entries-query.dto";
import { UpdateJournalEntryDto } from "./dto/update-journal-entry.dto";
import { JournalEntriesOrganizationGuard } from "./journal-entries-organization.guard";
import { JournalEntriesService } from "./journal-entries.service";
import { JournalEntryResourceGuard } from "./journal-entry-resource.guard";

@ApiTags("Journal entries")
@ApiBearerAuth()
@ApiCookieAuth("ledgerapp_access")
@Controller("journal-entries")
export class JournalEntriesController {
  constructor(private readonly journalEntriesService: JournalEntriesService) {}

  @Get()
  @UseGuards(JournalEntriesOrganizationGuard)
  @RequireOrganizationPermission("READ_BOOKKEEPING")
  @ApiOperation({ summary: "List organization-scoped journal entries" })
  @ApiQuery({ name: "organizationId", required: true })
  list(@Query() query: ListJournalEntriesQueryDto, @Req() request: AuthenticatedRequest) {
    return this.journalEntriesService.list(this.getOrganizationId(request), query);
  }

  @Get("options")
  @UseGuards(JournalEntriesOrganizationGuard)
  @RequireOrganizationPermission("READ_BOOKKEEPING")
  @ApiOperation({ summary: "Get fiscal calendar and voucher series for a transaction date" })
  @ApiQuery({ name: "organizationId", required: true })
  @ApiQuery({ name: "transactionDate", required: true })
  options(@Query() query: JournalEntryOptionsQueryDto, @Req() request: AuthenticatedRequest) {
    return this.journalEntriesService.getOptions(this.getOrganizationId(request), query);
  }

  @Get(":id")
  @UseGuards(JournalEntryResourceGuard)
  @RequireOrganizationPermission("READ_BOOKKEEPING")
  @ApiOperation({ summary: "Get one journal entry after tenant verification" })
  getOne(@Param("id") journalEntryId: string, @Req() request: AuthenticatedRequest) {
    return this.journalEntriesService.findOne(this.getOrganizationId(request), journalEntryId);
  }

  @Post()
  @UseGuards(JournalEntriesOrganizationGuard)
  @RequireOrganizationPermission("CREATE_BOOKKEEPING")
  @ApiOperation({ summary: "Create a draft journal entry" })
  create(
    @Body() dto: CreateJournalEntryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest
  ) {
    return this.journalEntriesService.create(
      this.getOrganizationId(request),
      user.id,
      dto,
      this.getAuditMetadata(request)
    );
  }

  @Patch(":id")
  @UseGuards(JournalEntryResourceGuard)
  @RequireOrganizationPermission("CREATE_BOOKKEEPING")
  @ApiOperation({ summary: "Update a draft journal entry" })
  update(
    @Param("id") journalEntryId: string,
    @Body() dto: UpdateJournalEntryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest
  ) {
    return this.journalEntriesService.update(
      this.getOrganizationId(request),
      journalEntryId,
      user.id,
      dto,
      this.getAuditMetadata(request)
    );
  }

  @Post(":id/post")
  @UseGuards(JournalEntryResourceGuard)
  @RequireOrganizationPermission("CREATE_BOOKKEEPING")
  @ApiOperation({ summary: "Atomically allocate and post a balanced draft" })
  post(
    @Param("id") journalEntryId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest
  ) {
    return this.journalEntriesService.post(
      this.getOrganizationId(request),
      journalEntryId,
      user.id,
      this.getAuditMetadata(request)
    );
  }

  private getOrganizationId(request: AuthenticatedRequest): string {
    const organizationId = request.organizationMembership?.organizationId;

    if (!organizationId) {
      throw new Error("Journal entry routes require an organization membership context.");
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

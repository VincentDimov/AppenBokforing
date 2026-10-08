import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JournalEntriesOrganizationGuard } from "../journal-entries/journal-entries-organization.guard";
import { RequireOrganizationPermission } from "../organizations/decorators/require-organization-permission.decorator";
import { IncomeStatementQueryDto } from "./dto/income-statement-query.dto";
import { ReportsService } from "./reports.service";
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly reports: ReportsService) {}
  @Get()
  @UseGuards(JournalEntriesOrganizationGuard)
  @RequireOrganizationPermission("READ_BOOKKEEPING")
  get(
    @Query() query: IncomeStatementQueryDto,
    @Req() request: AuthenticatedRequest
  ): Promise<unknown> {
    const org = request.organizationMembership?.organizationId;
    if (!org) throw new Error("Membership is required.");
    return this.reports.dashboard(org, query);
  }
}

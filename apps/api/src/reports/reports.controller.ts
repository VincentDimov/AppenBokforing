import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { RequireOrganizationPermission } from "../organizations/decorators/require-organization-permission.decorator";
import { JournalEntriesOrganizationGuard } from "../journal-entries/journal-entries-organization.guard";
import { GeneralLedgerQueryDto } from "./dto/general-ledger-query.dto";
import { IncomeStatementQueryDto } from "./dto/income-statement-query.dto";
import { ReportsService } from "./reports.service";
@ApiTags("Reports")
@ApiBearerAuth()
@ApiCookieAuth("ledgerapp_access")
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get("general-ledger")
  @UseGuards(JournalEntriesOrganizationGuard)
  @RequireOrganizationPermission("READ_BOOKKEEPING")
  @ApiOperation({ summary: "Return posted, tenant-scoped general ledger balances" })
  generalLedger(@Query() query: GeneralLedgerQueryDto, @Req() request: AuthenticatedRequest) {
    const organizationId = request.organizationMembership?.organizationId;
    if (!organizationId) throw new Error("Report requires organization membership.");
    return this.reports.generalLedger(organizationId, query);
  }

  @Get("income-statement")
  @UseGuards(JournalEntriesOrganizationGuard)
  @RequireOrganizationPermission("READ_BOOKKEEPING")
  @ApiOperation({ summary: "Return posted, tenant-scoped income statement balances" })
  incomeStatement(@Query() query: IncomeStatementQueryDto, @Req() request: AuthenticatedRequest) {
    const organizationId = request.organizationMembership?.organizationId;
    if (!organizationId) throw new Error("Report requires organization membership.");
    return this.reports.incomeStatement(organizationId, query);
  }
}

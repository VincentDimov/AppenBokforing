import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JournalEntriesOrganizationGuard } from "../journal-entries/journal-entries-organization.guard";
import { RequireOrganizationPermission } from "../organizations/decorators/require-organization-permission.decorator";
import {
  CalendarConfirmationDto,
  CreateFiscalYearDto,
  FiscalYearQueryDto
} from "./fiscal-years.dto";
import { FiscalYearsService } from "./fiscal-years.service";

@Controller()
@UseGuards(JournalEntriesOrganizationGuard)
export class FiscalYearsController {
  constructor(private readonly service: FiscalYearsService) {}
  @Get("fiscal-years")
  @RequireOrganizationPermission("READ_BOOKKEEPING")
  list(@Query() dto: FiscalYearQueryDto) {
    return this.service.list(dto.organizationId);
  }
  @Post("fiscal-years")
  @RequireOrganizationPermission("UPDATE_ORGANIZATION")
  create(@Body() dto: CreateFiscalYearDto, @Req() req: AuthenticatedRequest) {
    return this.service.create(dto.organizationId, req.auth!.id, dto, req.header("x-request-id"));
  }
  @Post("accounting-periods/:id/lock")
  @RequireOrganizationPermission("MANAGE_ACCOUNTING_PERIODS")
  lock(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CalendarConfirmationDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.service.setPeriodStatus(
      dto.organizationId,
      id,
      req.auth!.id,
      true,
      req.header("x-request-id")
    );
  }
  @Post("accounting-periods/:id/unlock")
  @RequireOrganizationPermission("MANAGE_ACCOUNTING_PERIODS")
  unlock(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CalendarConfirmationDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.service.setPeriodStatus(
      dto.organizationId,
      id,
      req.auth!.id,
      false,
      req.header("x-request-id")
    );
  }
  @Post("fiscal-years/:id/close")
  @RequireOrganizationPermission("UPDATE_ORGANIZATION")
  close(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CalendarConfirmationDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.service.close(dto.organizationId, id, req.auth!.id, req.header("x-request-id"));
  }
}

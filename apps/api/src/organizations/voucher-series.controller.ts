import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { OrganizationMembershipGuard } from "./organization-membership.guard";
import { RequireOrganizationPermission } from "./decorators/require-organization-permission.decorator";
import { CreateSeriesDto, SeriesQueryDto, UpdateSeriesDto } from "./voucher-series.dto";
import { VoucherSeriesService } from "./voucher-series.service";
@Controller("organizations/:id/voucher-series")
@UseGuards(OrganizationMembershipGuard)
export class VoucherSeriesController {
  constructor(private readonly service: VoucherSeriesService) {}
  @Get() list(@Param("id") org: string, @Query() query: SeriesQueryDto) {
    return this.service.list(org, query.fiscalYear);
  }
  @Post()
  @RequireOrganizationPermission("MANAGE_ACCOUNTS")
  create(@Param("id") org: string, @Body() dto: CreateSeriesDto, @Req() req: AuthenticatedRequest) {
    return this.service.create(org, req.auth!.id, dto, req.header("x-request-id"));
  }
  @Patch(":seriesId")
  @RequireOrganizationPermission("MANAGE_ACCOUNTS")
  update(
    @Param("id") org: string,
    @Param("seriesId", ParseUUIDPipe) id: string,
    @Body() dto: UpdateSeriesDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.service.update(org, id, req.auth!.id, dto, req.header("x-request-id"));
  }
}

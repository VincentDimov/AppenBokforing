import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { RequireOrganizationPermission } from "./decorators/require-organization-permission.decorator";
import { OrganizationMembershipGuard } from "./organization-membership.guard";
import {
  CarryForwardDto,
  ConfirmCarryForwardDto,
  OpeningBalancesQueryDto,
  SaveOpeningBalancesDto
} from "./opening-balances.dto";
import { OpeningBalancesService } from "./opening-balances.service";
@Controller("organizations/:id")
@UseGuards(OrganizationMembershipGuard)
export class OpeningBalancesController {
  constructor(private readonly service: OpeningBalancesService) {}
  @Get("opening-balances") list(@Param("id") org: string, @Query() dto: OpeningBalancesQueryDto) {
    return this.service.list(org, dto.fiscalYear);
  }
  @Post("opening-balances")
  @RequireOrganizationPermission("CREATE_BOOKKEEPING")
  save(
    @Param("id") org: string,
    @Body() dto: SaveOpeningBalancesDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.service.save(org, request.auth!.id, dto, request.header("x-request-id"));
  }
  @Post("carry-forward/preview")
  @RequireOrganizationPermission("CREATE_BOOKKEEPING")
  preview(
    @Param("id") org: string,
    @Body() dto: CarryForwardDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.service.preview(org, request.auth!.id, dto);
  }
  @Post("carry-forward/confirm")
  @RequireOrganizationPermission("CREATE_BOOKKEEPING")
  confirm(
    @Param("id") org: string,
    @Body() dto: ConfirmCarryForwardDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.service.confirm(
      org,
      request.auth!.id,
      dto.previewId,
      request.header("x-request-id")
    );
  }
}

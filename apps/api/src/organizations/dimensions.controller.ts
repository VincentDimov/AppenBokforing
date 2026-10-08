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
import { RequireOrganizationPermission } from "./decorators/require-organization-permission.decorator";
import { OrganizationMembershipGuard } from "./organization-membership.guard";
import { CreateDimensionDto, DimensionQueryDto, UpdateDimensionDto } from "./dimensions.dto";
import { DimensionsService } from "./dimensions.service";
@Controller("organizations/:id")
@UseGuards(OrganizationMembershipGuard)
export class DimensionsController {
  constructor(private readonly service: DimensionsService) {}
  @Get("projects") projects(@Param("id") org: string, @Query() dto: DimensionQueryDto) {
    return this.service.list(org, "project", dto);
  }
  @Get("cost-centers") costCenters(@Param("id") org: string, @Query() dto: DimensionQueryDto) {
    return this.service.list(org, "costCenter", dto);
  }
  @Post("projects")
  @RequireOrganizationPermission("MANAGE_ACCOUNTS")
  createProject(
    @Param("id") org: string,
    @Body() dto: CreateDimensionDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.service.create(org, req.auth!.id, "project", dto, req.header("x-request-id"));
  }
  @Post("cost-centers")
  @RequireOrganizationPermission("MANAGE_ACCOUNTS")
  createCostCenter(
    @Param("id") org: string,
    @Body() dto: CreateDimensionDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.service.create(org, req.auth!.id, "costCenter", dto, req.header("x-request-id"));
  }
  @Patch("projects/:dimensionId")
  @RequireOrganizationPermission("MANAGE_ACCOUNTS")
  updateProject(
    @Param("id") org: string,
    @Param("dimensionId", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDimensionDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.service.update(org, id, req.auth!.id, "project", dto, req.header("x-request-id"));
  }
  @Patch("cost-centers/:dimensionId")
  @RequireOrganizationPermission("MANAGE_ACCOUNTS")
  updateCostCenter(
    @Param("id") org: string,
    @Param("dimensionId", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDimensionDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.service.update(
      org,
      id,
      req.auth!.id,
      "costCenter",
      dto,
      req.header("x-request-id")
    );
  }
}

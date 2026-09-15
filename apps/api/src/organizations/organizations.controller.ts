import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RequireOrganizationPermission } from "./decorators/require-organization-permission.decorator";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";
import { OrganizationMembershipGuard } from "./organization-membership.guard";
import { OrganizationsService } from "./organizations.service";

@ApiTags("Organizations")
@ApiBearerAuth()
@ApiCookieAuth("ledgerapp_access")
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: "List organizations for the authenticated user" })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.listForUser(user.id);
  }

  @Post()
  @ApiOperation({ summary: "Create an organization and owner membership" })
  create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest
  ) {
    return this.organizationsService.create(user.id, dto, this.getAuditMetadata(request));
  }

  @Get(":id")
  @UseGuards(OrganizationMembershipGuard)
  @ApiOperation({ summary: "Get an organization after verifying membership" })
  getOne(@Param("id", new ParseUUIDPipe({ version: "4" })) organizationId: string) {
    return this.organizationsService.findOne(organizationId);
  }

  @Patch(":id")
  @UseGuards(OrganizationMembershipGuard)
  @RequireOrganizationPermission("UPDATE_ORGANIZATION")
  @ApiOperation({ summary: "Update organization settings (owner or admin)" })
  update(
    @Param("id", new ParseUUIDPipe({ version: "4" })) organizationId: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest
  ) {
    return this.organizationsService.update(
      organizationId,
      user.id,
      dto,
      this.getAuditMetadata(request)
    );
  }

  private getAuditMetadata(request: AuthenticatedRequest) {
    const requestId = request.header("x-request-id")?.slice(0, 100);

    return {
      ipAddress: request.ip?.slice(0, 64),
      requestId
    };
  }
}

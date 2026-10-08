import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedRequest, AuthenticatedUser } from "../auth/auth.types";
import { OrganizationMembershipGuard } from "./organization-membership.guard";
import { RequireOrganizationPermission } from "./decorators/require-organization-permission.decorator";
import { MembersService } from "./members.service";
import {
  AcceptInvitationDto,
  ChangeMemberRoleDto,
  InviteMemberDto,
  TransferOwnerDto
} from "./members.dto";

@Controller("organizations/:id")
@UseGuards(OrganizationMembershipGuard)
export class MembersController {
  constructor(private readonly service: MembersService) {}
  @Get("members") list(@Param("id") org: string) {
    return this.service.list(org);
  }
  @Post("invitations")
  @RequireOrganizationPermission("MANAGE_MEMBERS")
  invite(
    @Param("id") org: string,
    @Body() dto: InviteMemberDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: AuthenticatedRequest
  ) {
    return this.service.invite(org, actor.id, dto.email, dto.role, request.header("x-request-id"));
  }
  @Delete("invitations/:invitationId")
  @RequireOrganizationPermission("MANAGE_MEMBERS")
  revoke(
    @Param("id") org: string,
    @Param("invitationId", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: AuthenticatedRequest
  ) {
    return this.service.revoke(org, id, actor.id, request.header("x-request-id"));
  }
  @Patch("members/:memberId")
  @RequireOrganizationPermission("MANAGE_MEMBERS")
  change(
    @Param("id") org: string,
    @Param("memberId", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: ChangeMemberRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: AuthenticatedRequest
  ) {
    return this.service.change(org, id, actor.id, dto.role, request.header("x-request-id"));
  }
  @Delete("members/:memberId")
  @RequireOrganizationPermission("MANAGE_MEMBERS")
  remove(
    @Param("id") org: string,
    @Param("memberId", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: AuthenticatedRequest
  ) {
    return this.service.change(org, id, actor.id, null, request.header("x-request-id"));
  }
  @Post("transfer-ownership")
  @RequireOrganizationPermission("MANAGE_MEMBERS")
  transfer(
    @Param("id") org: string,
    @Body() dto: TransferOwnerDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: AuthenticatedRequest
  ) {
    return this.service.transfer(org, dto.memberId, actor.id, request.header("x-request-id"));
  }
}
@Controller("invitations")
export class InvitationAcceptanceController {
  constructor(private readonly service: MembersService) {}
  @Post("accept")
  accept(
    @Body() dto: AcceptInvitationDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: AuthenticatedRequest
  ) {
    return this.service.accept(actor.id, actor.email, dto.token, request.header("x-request-id"));
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { PlatformAdminGuard, adminContext } from "./platform-admin.guard";
import { RequirePlatformPermission } from "./platform-admin.permissions";
import { PlatformAdminService } from "./platform-admin.service";
import { PlatformAdminSecurityService } from "./platform-admin-security.service";
import {
  AdminListDto,
  AdminConfirmationDto,
  AdminUserUpdateDto,
  AdminStatusDto,
  AdminTemporaryPasswordDto,
  AdminMembershipDto,
  AdminMembershipUpdateDto,
  AdminOrganizationUpdateDto,
  AdminOwnerTransferDto,
  AdminGrantDto,
  AdminCreateUserDto,
  AdminCreateOrganizationDto,
  AdminMfaDto,
  AdminRecoveryDto
} from "./platform-admin.dto";

@Controller("platform-admin")
@UseGuards(PlatformAdminGuard)
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class PlatformAdminController {
  constructor(private readonly service: PlatformAdminService) {}
  @Get("dashboard") dashboard(
    @Query() dto: AdminListDto
  ): ReturnType<PlatformAdminService["dashboard"]> {
    return this.service.dashboard(dto);
  }
  @Get("users") users(@Query() dto: AdminListDto) {
    return this.service.users(dto);
  }
  @Post("users") @RequirePlatformPermission("WRITE") createUser(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AdminCreateUserDto
  ) {
    return this.service.createUser(adminContext(req), dto);
  }
  @Get("users/:id") user(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.user(id);
  }
  @Patch("users/:id") @RequirePlatformPermission("WRITE") updateUser(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminUserUpdateDto
  ) {
    return this.service.updateUser(adminContext(req), id, dto);
  }
  @Post("users/:id/status") @RequirePlatformPermission("WRITE") status(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminStatusDto
  ) {
    return this.service.setUserStatus(adminContext(req), id, dto.status, dto.confirmation);
  }
  @Post("users/:id/suspend") @RequirePlatformPermission("WRITE") suspend(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminConfirmationDto
  ) {
    return this.service.setUserStatus(adminContext(req), id, "SUSPENDED", dto.confirmation);
  }
  @Post("users/:id/reactivate") @RequirePlatformPermission("WRITE") reactivate(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminConfirmationDto
  ) {
    return this.service.setUserStatus(adminContext(req), id, "ACTIVE", dto.confirmation);
  }
  @Post("users/:id/revoke-sessions") @RequirePlatformPermission("WRITE") revokeSessions(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminConfirmationDto
  ) {
    return this.service.revokeSessions(adminContext(req), id, dto.confirmation);
  }
  @Post("users/:id/sessions/:sessionId/revoke") @RequirePlatformPermission("WRITE") revokeSession(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body() dto: AdminConfirmationDto
  ) {
    return this.service.revokeSessions(adminContext(req), id, dto.confirmation, sessionId);
  }
  @Post("users/:id/temporary-password") @RequirePlatformPermission("WRITE") temporaryPassword(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminTemporaryPasswordDto
  ) {
    return this.service.temporaryPassword(adminContext(req), id, dto.password, dto.confirmation);
  }
  @Post("users/:id/require-password-change") @RequirePlatformPermission("WRITE") requirePassword(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminConfirmationDto
  ) {
    return this.service.temporaryPassword(adminContext(req), id, "", dto.confirmation, true);
  }
  @Post("users/:id/password-reset") @RequirePlatformPermission("WRITE") passwordReset(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminConfirmationDto
  ) {
    return this.service.passwordReset(adminContext(req), id, dto.confirmation);
  }
  @Get("users/:id/memberships") memberships(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() dto: AdminListDto
  ) {
    return this.service.memberships(id, dto);
  }
  @Post("users/:id/memberships") @RequirePlatformPermission("WRITE") addMembership(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminMembershipDto
  ) {
    return this.service.addMembership(
      adminContext(req),
      id,
      dto.organizationId,
      dto.role,
      dto.confirmation
    );
  }
  @Patch("users/:id/memberships/:membershipId")
  @RequirePlatformPermission("WRITE")
  changeMembership(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
    @Body() dto: AdminMembershipUpdateDto
  ) {
    return this.service.changeMembership(adminContext(req), id, membershipId, dto);
  }
  @Delete("users/:id/memberships/:membershipId")
  @RequirePlatformPermission("WRITE")
  removeMembership(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
    @Body() dto: AdminConfirmationDto
  ) {
    return this.service.changeMembership(adminContext(req), id, membershipId, {
      ...dto,
      removed: true
    });
  }
  @Get("organizations") organizations(@Query() dto: AdminListDto) {
    return this.service.organizations(dto);
  }
  @Post("organizations") @RequirePlatformPermission("WRITE") createOrganization(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AdminCreateOrganizationDto
  ) {
    return this.service.createOrganization(adminContext(req), dto);
  }
  @Get("organizations/:id") organization(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.organization(id);
  }
  @Patch("organizations/:id") @RequirePlatformPermission("WRITE") updateOrganization(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminOrganizationUpdateDto
  ) {
    return this.service.updateOrganization(adminContext(req), id, dto);
  }
  @Post("organizations/:id/deactivate") @RequirePlatformPermission("WRITE") deactivateOrganization(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminConfirmationDto
  ) {
    return this.service.organizationStatus(adminContext(req), id, false, dto.confirmation);
  }
  @Post("organizations/:id/reactivate") @RequirePlatformPermission("WRITE") reactivateOrganization(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminConfirmationDto
  ) {
    return this.service.organizationStatus(adminContext(req), id, true, dto.confirmation);
  }
  @Get("organizations/:id/members") members(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() dto: AdminListDto
  ) {
    return this.service.organizationMembers(id, dto);
  }
  @Post("organizations/:id/transfer-owner") @RequirePlatformPermission("WRITE") transferOwner(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminOwnerTransferDto
  ) {
    return this.service.transferOwner(
      adminContext(req),
      id,
      dto.fromUserId,
      dto.toUserId,
      dto.confirmation
    );
  }
  @Get("administrators") administrators(@Query() dto: AdminListDto) {
    return this.service.administrators(dto);
  }
  @Post("administrators") @RequirePlatformPermission("GRANTS") grant(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AdminGrantDto
  ) {
    return this.service.grant(adminContext(req), dto);
  }
  @Get("invitations") invitations(@Query() dto: AdminListDto) {
    return this.service.invitations(dto);
  }
  @Post("invitations/:id/revoke") @RequirePlatformPermission("WRITE") revokeInvitation(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminConfirmationDto
  ) {
    return this.service.revokeInvitation(adminContext(req), id, dto.confirmation);
  }
  @Get("audit") audit(@Query() dto: AdminListDto): ReturnType<PlatformAdminService["audit"]> {
    return this.service.audit(dto);
  }
  @Get("sessions") sessions(@Query() dto: AdminListDto) {
    return this.service.sessions(dto);
  }
  @Get("usage") usage() {
    return this.service.usage();
  }
  @Get("system") system() {
    return this.service.system();
  }
  @Get("security") security(): ReturnType<PlatformAdminService["securityCenter"]> {
    return this.service.securityCenter();
  }
  @Get("jobs") jobs(@Query() dto: AdminListDto) {
    return this.service.jobs(dto);
  }
}

// Own-account security setup is authenticated but deliberately does not require
// MFA already to be enrolled. No global lists or other-user writes exist here.
@Controller("platform-admin/security-setup")
@Throttle({ default: { limit: 5, ttl: 60000 } })
export class PlatformAdminSecurityController {
  constructor(private readonly security: PlatformAdminSecurityService) {}
  @Get("status") @Throttle({ default: { limit: 30, ttl: 60000 } }) status(
    @Req() req: AuthenticatedRequest
  ) {
    const ctx = adminContext(req);
    return this.security.state(ctx.user.id, ctx.user.sessionId);
  }
  @Post("enroll") @HttpCode(200) enroll(@Req() req: AuthenticatedRequest) {
    return this.security.enroll(adminContext(req));
  }
  @Post("verify") @HttpCode(200) verify(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AdminMfaDto
  ) {
    return this.security.verifyMfa(adminContext(req), dto.code, dto.currentPassword);
  }
  @Post("recover") @HttpCode(200) recover(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AdminRecoveryDto
  ) {
    return this.security.recover(adminContext(req), dto.recoveryCode, dto.currentPassword);
  }
}

import { Transform } from "class-transformer";
import { IsEmail, IsEnum, IsString, IsUUID, Length } from "class-validator";
import { OrganizationMemberRole } from "@ledgerapp/db";
export class InviteMemberDto {
  @IsEmail()
  @Length(3, 320)
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  email!: string;
  @IsEnum(OrganizationMemberRole) role!: OrganizationMemberRole;
}
export class ChangeMemberRoleDto {
  @IsEnum(OrganizationMemberRole) role!: OrganizationMemberRole;
}
export class TransferOwnerDto {
  @IsUUID("4") memberId!: string;
}
export class AcceptInvitationDto {
  @IsString() @Length(43, 43) token!: string;
}

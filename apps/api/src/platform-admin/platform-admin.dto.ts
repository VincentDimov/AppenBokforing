import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength
} from "class-validator";
import { OrganizationMemberRole, PlatformAdminRole, UserAccountStatus } from "@ledgerapp/db";

export class AdminListDto {
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(200) page = 1;
  @Type(() => Number) @IsIn([10, 25, 50, 100]) pageSize = 25;
  @IsOptional()
  @IsIn([
    "name_asc",
    "name_desc",
    "oldest",
    "newest",
    "last_login",
    "company",
    "members_desc",
    "members_asc",
    "updated"
  ])
  sort = "name_asc";
  @IsOptional() @IsEnum(UserAccountStatus) status?: UserAccountStatus;
  @IsOptional() @IsIn(["active", "inactive"]) organizationStatus?: string;
  @IsOptional() @IsIn(["yes", "no"]) hasCompany?: string;
  @IsOptional() @IsIn(["yes", "no"]) platformAdmin?: string;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsEnum(OrganizationMemberRole) role?: OrganizationMemberRole;
  @IsOptional() @Matches(/^[A-Z]{2}$/) country?: string;
  @IsOptional() @IsISO8601({ strict: true }) fromDate?: string;
  @IsOptional() @IsISO8601({ strict: true }) toDate?: string;
  @IsOptional() @IsISO8601({ strict: true }) loginFrom?: string;
  @IsOptional() @IsISO8601({ strict: true }) loginTo?: string;
  @IsOptional() @IsUUID() actorUserId?: string;
  @IsOptional() @IsString() @MaxLength(100) action?: string;
  @IsOptional() @IsIn(["SUCCESS", "DENIED", "FAILURE"]) result?: string;
  @IsOptional() @IsString() @MaxLength(80) targetType?: string;
}
export class AdminUserUpdateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) displayName?: string;
  @IsOptional() @IsString() @MaxLength(2000) adminNotes?: string;
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(320)
  email?: string;
}
export class AdminConfirmationDto {
  @IsString() @MaxLength(320) confirmation!: string;
}
export class AdminStatusDto extends AdminConfirmationDto {
  @IsEnum(UserAccountStatus) status!: UserAccountStatus;
}
export class AdminTemporaryPasswordDto extends AdminConfirmationDto {
  @IsString() @MinLength(14) @MaxLength(128) password!: string;
}
export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128) currentPassword!: string;
  @IsString() @MinLength(14) @MaxLength(128) newPassword!: string;
}
export class AdminMfaDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
  @IsString() @MinLength(1) @MaxLength(128) currentPassword!: string;
}
export class AdminRecoveryDto {
  @IsString() @Length(32, 32) @Matches(/^[a-f0-9]+$/) recoveryCode!: string;
  @IsString() @MinLength(1) @MaxLength(128) currentPassword!: string;
}
export class AdminMembershipDto extends AdminConfirmationDto {
  @IsUUID() organizationId!: string;
  @IsEnum(OrganizationMemberRole) role!: OrganizationMemberRole;
}
export class AdminMembershipUpdateDto extends AdminConfirmationDto {
  @IsOptional() @IsEnum(OrganizationMemberRole) role?: OrganizationMemberRole;
  @IsOptional() @IsBoolean() removed?: boolean;
}
export class AdminOwnerTransferDto extends AdminConfirmationDto {
  @IsUUID() fromUserId!: string;
  @IsUUID() toUserId!: string;
}
export class AdminGrantDto extends AdminConfirmationDto {
  @IsUUID() userId!: string;
  @IsEnum(PlatformAdminRole) role!: PlatformAdminRole;
  @IsBoolean() isActive!: boolean;
}
export class AdminOrganizationUpdateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @Matches(/^\d{6}-?\d{4}$/) organizationNumber?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) countryCode?: string;
}
export class AdminCreateOrganizationDto extends AdminOrganizationUpdateDto {
  @IsString() @MinLength(1) @MaxLength(160) declare name: string;
  @IsUUID() ownerUserId!: string;
}
export class AdminCreateUserDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(320)
  email!: string;
  @IsString() @MinLength(1) @MaxLength(160) displayName!: string;
  @IsString() @MinLength(14) @MaxLength(128) password!: string;
}

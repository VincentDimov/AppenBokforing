import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min
} from "class-validator";
import { AccountingFramework, BasAccountCategory } from "@ledgerapp/db";

export class CatalogQueryDto {
  @IsUUID("4") organizationId!: string;
  @IsOptional()
  @IsString()
  @Length(0, 200)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  q?: string;
  @IsOptional() @IsIn(["all", "active", "available", "custom"]) tab:
    "all" | "active" | "available" | "custom" = "all";
  @IsOptional() @IsIn(["1", "2", "3", "4", "5", "6", "7", "8"]) accountClass?: string;
  @IsOptional() @IsString() @Matches(/^[1-8]\d$/) group?: string;
  @IsOptional() @IsEnum(BasAccountCategory) category?: BasAccountCategory;
  @IsOptional() @IsIn(["compatible", "restricted"]) compatibility?: string;
  @IsOptional() @IsIn(["active", "inactive"]) status?: string;
  @IsOptional() @IsIn(["number", "name-asc", "name-desc"]) sort:
    "number" | "name-asc" | "name-desc" = "number";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) page = 1;
  @IsOptional() @Type(() => Number) @IsIn([25, 50, 100]) pageSize = 50;
}
export class ActivateCatalogDto {
  @IsUUID("4") organizationId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  catalogAccountIds!: string[];
}
export class FrameworkDto {
  @IsUUID("4") organizationId!: string;
  @IsEnum(AccountingFramework) framework!: AccountingFramework;
  @IsString() @Length(1, 160) confirmation!: string;
}
export class ProvisionCatalogDto {
  @IsUUID("4") organizationId!: string;
  @IsOptional() @IsUUID("4") versionId?: string;
}

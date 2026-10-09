import { Transform, Type } from "class-transformer";
import {
  IsOptional,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  IsEnum,
  Length,
  Min,
  Max
} from "class-validator";
import { AccountType } from "@ledgerapp/db";

function normalizeSearch(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim() || undefined;
}

export class ListAccountsQueryDto {
  @IsUUID("4")
  organizationId!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeSearch(value))
  @Length(1, 160)
  q?: string;
  @IsOptional() @IsEnum(AccountType) accountType?: AccountType;
  @IsOptional() @IsIn(["true", "false"]) activeOnly?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) limit = 500;
}

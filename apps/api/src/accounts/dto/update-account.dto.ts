import { AccountType } from "@ledgerapp/db";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf
} from "class-validator";

const ACCOUNT_NUMBER_PATTERN = /^\d{1,16}$/;

function normalizeOptionalString(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim() || undefined;
}

function normalizeVatCode(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toUpperCase() || undefined : value;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeOptionalString(value))
  @Matches(ACCOUNT_NUMBER_PATTERN, {
    message: "number must contain between 1 and 16 digits"
  })
  number?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeOptionalString(value))
  @Length(1, 160)
  name?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() || null : value))
  @Length(1, 500)
  description?: string | null;

  @IsOptional()
  @IsEnum(AccountType)
  accountType?: AccountType;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** The organization-local VAT code, such as MOMS25-UT. Null clears the mapping. */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Transform(({ value }) => normalizeVatCode(value))
  @Length(1, 32)
  vatCode?: string | null;
}

import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUUID, Length, Matches, ValidateIf } from "class-validator";

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

function normalizeCode(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toUpperCase() || undefined : value;
}

function normalizeMoney(value: unknown): unknown {
  return typeof value === "string" ? value.trim().replace(",", ".") : value;
}

function normalizeOptionalText(value: unknown): unknown {
  return typeof value === "string" ? value.trim() || null : value;
}

/**
 * Amounts deliberately remain decimal strings until Prisma persists NUMERIC
 * values. JavaScript number input is not accepted for accounting amounts.
 */
export class JournalLineDto {
  @IsUUID("4")
  accountId!: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Transform(({ value }) => normalizeOptionalText(value))
  @Length(1, 500)
  description?: string | null;

  @IsString()
  @Transform(({ value }) => normalizeMoney(value))
  @Matches(MONEY_PATTERN, {
    message: "debit must be a non-negative decimal string with at most two decimal places"
  })
  debit!: string;

  @IsString()
  @Transform(({ value }) => normalizeMoney(value))
  @Matches(MONEY_PATTERN, {
    message: "credit must be a non-negative decimal string with at most two decimal places"
  })
  credit!: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Transform(({ value }) => normalizeCode(value))
  @Length(1, 32)
  vatCode?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Transform(({ value }) => normalizeCode(value))
  @Length(1, 32)
  projectCode?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Transform(({ value }) => normalizeCode(value))
  @Length(1, 32)
  costCenterCode?: string | null;
}

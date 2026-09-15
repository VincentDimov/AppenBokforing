import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, Length, Matches } from "class-validator";

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function trimString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeCurrency(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  @Length(1, 160)
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  @Length(1, 32)
  organizationNumber?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeCurrency(value))
  @Matches(CURRENCY_PATTERN, {
    message: "defaultCurrency must be a three-letter ISO currency code"
  })
  defaultCurrency?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

import { Transform } from "class-transformer";
import { Equals, IsBoolean, IsOptional, IsString, Length, Matches } from "class-validator";

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
  @Matches(/^\d{6}-?\d{4}$/)
  organizationNumber?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeCurrency(value))
  @Matches(CURRENCY_PATTERN)
  @Equals("SEK")
  defaultCurrency?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional() @Equals("SE") countryCode?: string;
  @IsOptional() @IsString() @Length(0, 500) address?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{1,16}$/) defaultVoucherSeriesCode?: string;
}

import { Transform } from "class-transformer";
import { IsOptional, IsString, Length, Matches } from "class-validator";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function trimString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeSlug(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

function normalizeCurrency(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}

export class CreateOrganizationDto {
  @IsString()
  @Transform(({ value }) => trimString(value))
  @Length(1, 160)
  name!: string;

  @IsString()
  @Transform(({ value }) => normalizeSlug(value))
  @Length(2, 80)
  @Matches(SLUG_PATTERN, {
    message: "slug must contain lowercase letters, digits and single hyphens only"
  })
  slug!: string;

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
}

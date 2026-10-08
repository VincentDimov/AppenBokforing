import { Transform } from "class-transformer";
import { Equals, IsOptional, IsString, IsUUID, Length, Matches } from "class-validator";

export class OnboardingDto {
  @IsUUID("4") setupKey!: string;
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @Length(1, 160)
  name!: string;
  @IsOptional() @IsString() @Matches(/^\d{6}-?\d{4}$/) organizationNumber?: string;
  @IsOptional() @Equals("SE") countryCode?: string;
  @IsOptional() @Equals("SEK") defaultCurrency?: string;
  @IsOptional() @IsString() @Length(0, 500) address?: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate!: string;
}

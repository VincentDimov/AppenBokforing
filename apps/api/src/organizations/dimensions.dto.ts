import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches } from "class-validator";
// ASCII object identities round-trip in the supported PC8 subset; names remain Swedish.
export class CreateDimensionDto {
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_-]{1,32}$/)
  code!: string;
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @Length(1, 160)
  name!: string;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
}
export class UpdateDimensionDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_-]{1,32}$/)
  code?: string;
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @Length(1, 160)
  name?: string;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class DimensionQueryDto {
  @IsOptional() @IsString() @Length(0, 160) search?: string;
  @IsOptional() @IsIn(["true", "false"]) activeOnly?: string;
}

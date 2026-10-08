import { IsBoolean, IsOptional, IsString, IsUUID, Length, Matches } from "class-validator";
export class SeriesQueryDto {
  @IsUUID("4") fiscalYear!: string;
}
export class CreateSeriesDto {
  @IsUUID("4") fiscalYearId!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,16}$/) code!: string;
  @IsString() @Length(1, 160) name!: string;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
}
export class UpdateSeriesDto {
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{1,16}$/) code?: string;
  @IsOptional() @IsString() @Length(1, 160) name?: string;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

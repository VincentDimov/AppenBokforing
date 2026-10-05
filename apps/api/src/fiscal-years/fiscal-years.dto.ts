import { Equals, IsDateString, IsString, IsUUID, MaxLength } from "class-validator";

export class FiscalYearQueryDto {
  @IsUUID() organizationId!: string;
}
export class CalendarConfirmationDto extends FiscalYearQueryDto {
  @Equals(true) confirm!: boolean;
}
export class CreateFiscalYearDto extends FiscalYearQueryDto {
  @IsString() @MaxLength(80) name!: string;
  @IsDateString({ strict: true }) startDate!: string;
  @IsDateString({ strict: true }) endDate!: string;
}

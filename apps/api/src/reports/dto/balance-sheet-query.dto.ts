import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class BalanceSheetQueryDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  fiscalYear!: string;

  @IsDateString()
  reportDate!: string;

  @IsOptional()
  @IsDateString()
  comparisonDate?: string;
}

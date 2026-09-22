import { IsDateString, IsOptional, IsString, IsUUID } from "class-validator";

export class IncomeStatementQueryDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  fiscalYear!: string;

  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsOptional()
  @IsString()
  project?: string;

  @IsOptional()
  @IsString()
  costCenter?: string;
}

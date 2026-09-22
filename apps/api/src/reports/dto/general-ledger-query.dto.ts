import { IsDateString, IsOptional, IsString, IsUUID, Matches } from "class-validator";

export class GeneralLedgerQueryDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  fiscalYear!: string;

  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsOptional()
  @Matches(/^\d{1,16}$/)
  accountFrom?: string;

  @IsOptional()
  @Matches(/^\d{1,16}$/)
  accountTo?: string;

  @IsOptional()
  @IsString()
  project?: string;

  @IsOptional()
  @IsString()
  costCenter?: string;
}

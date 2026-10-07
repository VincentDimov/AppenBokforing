import { IsDateString, IsUUID } from "class-validator";

export class TrialBalanceQueryDto {
  @IsUUID()
  organizationId!: string;
  @IsUUID()
  fiscalYear!: string;
  @IsDateString()
  fromDate!: string;
  @IsDateString()
  toDate!: string;
}

import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsString, IsUUID, Matches, ValidateNested } from "class-validator";
export class OpeningBalancesQueryDto {
  @IsUUID("4") fiscalYear!: string;
}
export class OpeningBalanceRowDto {
  @IsUUID("4") accountId!: string;
  @IsString() @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/) debit!: string;
  @IsString() @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/) credit!: string;
}
export class SaveOpeningBalancesDto {
  @IsUUID("4") fiscalYearId!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedFingerprint!: string;
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => OpeningBalanceRowDto)
  rows!: OpeningBalanceRowDto[];
}
export class CarryForwardDto {
  @IsUUID("4") sourceFiscalYearId!: string;
  @IsUUID("4") targetFiscalYearId!: string;
  @IsUUID("4") resultAccountId!: string;
}
export class ConfirmCarryForwardDto {
  @IsUUID("4") previewId!: string;
}

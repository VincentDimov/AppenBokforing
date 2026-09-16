import { IsOptional, IsString, IsUUID, Length, Matches } from "class-validator";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A correction has its own posting date and voucher series. This permits an
 * historical voucher to be corrected in the currently open period without
 * changing the original accounting record.
 */
export class ReverseJournalEntryDto {
  @IsUUID("4")
  voucherSeriesId!: string;

  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: "transactionDate must use YYYY-MM-DD" })
  transactionDate!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;
}

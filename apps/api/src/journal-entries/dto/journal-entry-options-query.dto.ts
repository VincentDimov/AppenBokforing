import { IsString, IsUUID, Matches } from "class-validator";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class JournalEntryOptionsQueryDto {
  @IsUUID("4")
  organizationId!: string;

  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: "transactionDate must use YYYY-MM-DD" })
  transactionDate!: string;
}

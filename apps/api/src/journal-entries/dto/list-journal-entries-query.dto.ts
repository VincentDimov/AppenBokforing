import { JournalEntryStatus } from "@ledgerapp/db";
import { IsEnum, IsOptional, IsUUID } from "class-validator";

export class ListJournalEntriesQueryDto {
  @IsUUID("4")
  organizationId!: string;

  @IsOptional()
  @IsEnum(JournalEntryStatus)
  status?: JournalEntryStatus;
}

import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min
} from "class-validator";
import { JournalEntryStatus } from "@ledgerapp/db";
export class ArchiveQueryDto {
  @IsOptional() @IsString() @Length(0, 160) search?: string;
  @IsOptional() @IsDateString() fromDate?: string;
  @IsOptional() @IsDateString() toDate?: string;
  @IsOptional()
  @IsIn(["application/pdf", "image/jpeg", "image/png", "image/webp"])
  mimeType?: string;
  @IsOptional() @IsEnum(JournalEntryStatus) status?: JournalEntryStatus;
  @IsOptional() @Matches(/^[A-Z0-9_-]{1,16}$/) series?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) voucherNumber?: number;
  @IsOptional() @IsUUID() uploadedBy?: string;
  @IsOptional() @IsIn(["true", "false"]) hasVoucher?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() @Length(1, 500) cursor?: string;
}

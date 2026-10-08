import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested
} from "class-validator";

import { JournalLineDto } from "./journal-line.dto";
import { IsInt, Min, Max } from "class-validator";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateJournalEntryDto {
  @IsInt()
  @Min(1)
  @Max(2147483646)
  expectedVersion!: number;
  @IsOptional()
  @IsUUID("4")
  voucherSeriesId?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: "transactionDate must use YYYY-MM-DD" })
  transactionDate?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines?: JournalLineDto[];
}

import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested
} from "class-validator";

import { JournalLineDto } from "./journal-line.dto";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateJournalEntryDto {
  @IsUUID("4")
  organizationId!: string;

  @IsUUID("4")
  voucherSeriesId!: string;

  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: "transactionDate must use YYYY-MM-DD" })
  transactionDate!: string;

  @IsString()
  @Length(1, 500)
  description!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

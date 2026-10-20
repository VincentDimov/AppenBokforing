import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsUUID,
  Matches
} from "class-validator";

export class AccountBalancesQueryDto {
  @IsUUID("4")
  organizationId!: string;

  @IsUUID("4")
  fiscalYearId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  date!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.split(",") : value
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  accountIds!: string[];
}

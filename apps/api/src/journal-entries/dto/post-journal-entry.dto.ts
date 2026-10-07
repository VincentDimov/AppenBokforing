import { IsInt, Min, Max } from "class-validator";
export class PostJournalEntryDto {
  @IsInt()
  @Min(1)
  @Max(2147483646)
  expectedVersion!: number;
}

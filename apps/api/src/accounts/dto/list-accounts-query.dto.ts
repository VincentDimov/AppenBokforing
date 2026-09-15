import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUUID, Length } from "class-validator";

function normalizeSearch(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim() || undefined;
}

export class ListAccountsQueryDto {
  @IsUUID("4")
  organizationId!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeSearch(value))
  @Length(1, 160)
  q?: string;
}

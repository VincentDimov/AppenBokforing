import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

function normalizeEmail(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

function normalizeName(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class RegisterDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @Transform(({ value }) => normalizeName(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  displayName!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

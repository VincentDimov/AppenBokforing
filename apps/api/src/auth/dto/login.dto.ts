import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

function normalizeEmail(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

export class LoginDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

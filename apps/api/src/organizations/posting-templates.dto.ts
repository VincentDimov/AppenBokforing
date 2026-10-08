import { Type, Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested
} from "class-validator";
import { BalanceSide } from "@ledgerapp/db";

export class TemplateLineDto {
  @IsUUID() accountId!: string;
  @IsEnum(BalanceSide) side!: BalanceSide;
  @IsOptional() @IsString() @Matches(/^\d{1,16}(\.\d{1,2})?$/) amount?: string | null;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
  @IsOptional() @IsUUID() projectId?: string | null;
  @IsOptional() @IsUUID() costCenterId?: string | null;
}
export class SaveTemplateDto {
  @IsString() @Matches(/^[A-Z0-9_-]{1,40}$/) code!: string;
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @Length(1, 160)
  name!: string;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
  @IsOptional() @IsString() @Length(0, 500) defaultText?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z0-9_-]{1,16}$/) voucherSeriesCode?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TemplateLineDto)
  lines!: TemplateLineDto[];
}
export class TemplateQueryDto {
  @IsOptional() @IsString() @Length(0, 160) search?: string;
  @IsOptional() @Matches(/^(true|false)$/) activeOnly?: string;
}

import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  Header,
  StreamableFile
} from "@nestjs/common";
import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { BadRequestException } from "@nestjs/common";
import { decodeSieBytes } from "@ledgerapp/sie";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JournalEntriesOrganizationGuard } from "../journal-entries/journal-entries-organization.guard";
import { RequireOrganizationPermission } from "../organizations/decorators/require-organization-permission.decorator";
import { SieService } from "./sie.service";
import { randomUUID } from "node:crypto";
import { Throttle } from "@nestjs/throttler";
class ImportSieDto {
  @IsOptional() @IsString() @Matches(/^[^/\\\p{Cc}\p{Cf}]{1,160}$/u) fileName?: string;
  @IsUUID() organizationId!: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() @MaxLength(174764) contentBase64?: string;
  @IsOptional() @IsString() @MaxLength(160) previewToken?: string;
  @IsOptional() @IsUUID() fiscalYearId?: string;
  @IsOptional() @IsBoolean() confirm?: boolean;
}
class ExportSieDto {
  @IsUUID() organizationId!: string;
  @IsUUID() fiscalYear!: string;
}
@Controller()
export class SieController {
  constructor(private readonly sie: SieService) {}
  @Post("imports/sie")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JournalEntriesOrganizationGuard)
  @RequireOrganizationPermission("CREATE_BOOKKEEPING")
  import(@Body() dto: ImportSieDto, @Req() request: AuthenticatedRequest): Promise<unknown> {
    const organizationId = request.organizationMembership?.organizationId;
    if (!organizationId) throw new Error("Import requires organization membership.");
    if ((dto.content === undefined) === (dto.contentBase64 === undefined))
      throw new BadRequestException("Provide exactly one of content or contentBase64.");
    if (
      dto.contentBase64 !== undefined &&
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dto.contentBase64)
    )
      throw new BadRequestException("Invalid base64 SIE bytes.");
    const bytes =
      dto.contentBase64 !== undefined ? Buffer.from(dto.contentBase64, "base64") : undefined;
    return this.sie.import(
      organizationId,
      dto.content ?? decodeSieBytes(bytes!),
      dto.confirm === true,
      request.auth?.id,
      request.header("x-request-id")?.slice(0, 100) || randomUUID(),
      {
        previewToken: dto.previewToken,
        fiscalYearId: dto.fiscalYearId,
        bytes,
        fileName: dto.fileName
      }
    );
  }
  @Get("exports/sie")
  @UseGuards(JournalEntriesOrganizationGuard)
  @RequireOrganizationPermission("READ_BOOKKEEPING")
  @Header("X-Content-Type-Options", "nosniff")
  @Header("Cache-Control", "no-store")
  async export(
    @Query() dto: ExportSieDto,
    @Req() request: AuthenticatedRequest
  ): Promise<StreamableFile> {
    const organizationId = request.organizationMembership?.organizationId;
    if (!organizationId) throw new Error("Export requires organization membership.");
    const content = await this.sie.export(
      organizationId,
      dto.fiscalYear,
      request.auth?.id,
      request.header("x-request-id")?.slice(0, 100) || randomUUID()
    );
    // Fixed filename: organization/record text never reaches response headers.
    return new StreamableFile(Buffer.from(content), {
      type: "application/octet-stream",
      disposition: 'attachment; filename="ledgerapp.sie"'
    });
  }
}

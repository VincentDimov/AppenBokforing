import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsBoolean, IsOptional, IsString, IsUUID } from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JournalEntriesOrganizationGuard } from "../journal-entries/journal-entries-organization.guard";
import { RequireOrganizationPermission } from "../organizations/decorators/require-organization-permission.decorator";
import { SieService } from "./sie.service";
import { randomUUID } from "node:crypto";
class ImportSieDto {
  @IsUUID() organizationId!: string;
  @IsString() content!: string;
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
  @UseGuards(JournalEntriesOrganizationGuard)
  @RequireOrganizationPermission("CREATE_BOOKKEEPING")
  import(@Body() dto: ImportSieDto, @Req() request: AuthenticatedRequest): Promise<unknown> {
    const organizationId = request.organizationMembership?.organizationId;
    if (!organizationId) throw new Error("Import requires organization membership.");
    return this.sie.import(
      organizationId,
      dto.content,
      dto.confirm === true,
      request.auth?.id,
      request.header("x-request-id")?.slice(0, 100) || randomUUID()
    );
  }
  @Get("exports/sie")
  @UseGuards(JournalEntriesOrganizationGuard)
  @RequireOrganizationPermission("READ_BOOKKEEPING")
  export(@Query() dto: ExportSieDto, @Req() request: AuthenticatedRequest): Promise<string> {
    const organizationId = request.organizationMembership?.organizationId;
    if (!organizationId) throw new Error("Export requires organization membership.");
    return this.sie.export(
      organizationId,
      dto.fiscalYear,
      request.auth?.id,
      request.header("x-request-id")?.slice(0, 100) || randomUUID()
    );
  }
}

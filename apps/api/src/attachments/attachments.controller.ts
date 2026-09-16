import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import type { AuthenticatedRequest, AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequireOrganizationPermission } from "../organizations/decorators/require-organization-permission.decorator";
import { JournalEntryResourceGuard } from "../journal-entries/journal-entry-resource.guard";
import { MAX_ATTACHMENT_BYTES } from "./attachment-file-validation";
import { AttachmentResourceGuard } from "./attachment-resource.guard";
import { AttachmentsService } from "./attachments.service";

@ApiTags("Attachments")
@ApiBearerAuth()
@ApiCookieAuth("ledgerapp_access")
@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get("journal-entries/:id/attachments")
  @UseGuards(JournalEntryResourceGuard)
  @RequireOrganizationPermission("READ_BOOKKEEPING")
  @ApiOperation({ summary: "List evidence attachments for a journal entry" })
  list(@Param("id") journalEntryId: string, @Req() request: AuthenticatedRequest) {
    return this.attachmentsService.list(this.getOrganizationId(request), journalEntryId);
  }

  @Post("journal-entries/:id/attachments")
  @UseGuards(JournalEntryResourceGuard)
  @RequireOrganizationPermission("CREATE_BOOKKEEPING")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 }
    })
  )
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      properties: {
        file: { format: "binary", type: "string" }
      },
      required: ["file"],
      type: "object"
    }
  })
  @ApiOperation({ summary: "Upload a verified private evidence attachment to a draft" })
  upload(
    @Param("id") journalEntryId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest
  ) {
    return this.attachmentsService.upload(
      this.getOrganizationId(request),
      journalEntryId,
      user.id,
      file,
      this.getAuditMetadata(request)
    );
  }

  @Get("attachments/:id/download")
  @UseGuards(AttachmentResourceGuard)
  @RequireOrganizationPermission("READ_BOOKKEEPING")
  @ApiOperation({ summary: "Create a short-lived signed download URL for an attachment" })
  download(@Param("id") attachmentId: string, @Req() request: AuthenticatedRequest) {
    return this.attachmentsService.createDownloadUrl(this.getOrganizationId(request), attachmentId);
  }

  private getOrganizationId(request: AuthenticatedRequest): string {
    const organizationId = request.organizationMembership?.organizationId;

    if (!organizationId) {
      throw new Error("Attachment routes require an organization membership context.");
    }

    return organizationId;
  }

  private getAuditMetadata(request: AuthenticatedRequest) {
    return {
      ipAddress: request.ip?.slice(0, 64),
      requestId: request.header("x-request-id")?.slice(0, 100)
    };
  }
}

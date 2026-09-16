import { randomUUID } from "node:crypto";

import {
  AttachmentKind,
  AuditAction,
  AuditEntityType,
  JournalEntryStatus,
  Prisma
} from "@ledgerapp/db";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { validateAttachmentFile } from "./attachment-file-validation";
import { OBJECT_STORAGE, type ObjectStorage } from "./object-storage";

interface AttachmentAuditMetadata {
  ipAddress?: string;
  requestId?: string;
}

const attachmentInclude = {
  uploadedBy: {
    select: { displayName: true, id: true }
  }
} satisfies Prisma.AttachmentInclude;

type AttachmentWithUploader = Prisma.AttachmentGetPayload<{
  include: typeof attachmentInclude;
}>;

/** Coordinates tenant-safe metadata persistence with private object storage. */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage
  ) {}

  async list(organizationId: string, journalEntryId: string) {
    const attachments = await this.database.prisma.attachment.findMany({
      include: attachmentInclude,
      orderBy: { createdAt: "desc" },
      where: { journalEntryId, organizationId }
    });

    return attachments.map((attachment) => this.toPublicAttachment(attachment));
  }

  async upload(
    organizationId: string,
    journalEntryId: string,
    actorUserId: string,
    file: Express.Multer.File | undefined,
    metadata: AttachmentAuditMetadata
  ) {
    const validatedFile = validateAttachmentFile(file);
    const currentEntry = await this.database.prisma.journalEntry.findFirst({
      select: { status: true },
      where: { id: journalEntryId, organizationId }
    });

    if (!currentEntry) {
      throw new NotFoundException("Journal entry not found.");
    }

    this.requireDraft(currentEntry.status);

    const storageKey = this.createStorageKey(organizationId, journalEntryId, validatedFile.extension);
    await this.objectStorage.putObject({
      body: validatedFile.buffer,
      contentType: validatedFile.mimeType,
      sha256: validatedFile.sha256,
      storageKey
    });

    try {
      const attachment = await this.database.prisma.$transaction(async (transaction) => {
        const entries = await transaction.$queryRaw<{ status: JournalEntryStatus }[]>`
          SELECT "status"
          FROM "journal_entries"
          WHERE "id" = ${journalEntryId}::uuid
            AND "organization_id" = ${organizationId}::uuid
          FOR UPDATE
        `;
        const entry = entries[0];

        if (!entry) {
          throw new NotFoundException("Journal entry not found.");
        }

        this.requireDraft(entry.status);
        const created = await transaction.attachment.create({
          data: {
            journalEntryId,
            kind: AttachmentKind.VOUCHER,
            mimeType: validatedFile.mimeType,
            organizationId,
            originalName: validatedFile.originalName,
            safeFileName: `attachment.${validatedFile.extension}`,
            sha256: validatedFile.sha256,
            size: BigInt(validatedFile.size),
            storageKey,
            uploadedById: actorUserId
          },
          include: attachmentInclude
        });

        await transaction.auditEvent.create({
          data: {
            action: AuditAction.CREATE,
            actorUserId,
            afterData: {
              journalEntryId,
              mimeType: created.mimeType,
              originalName: created.originalName,
              sha256: created.sha256,
              size: created.size.toString()
            },
            entityId: created.id,
            entityType: AuditEntityType.ATTACHMENT,
            ipAddress: metadata.ipAddress,
            metadata: metadata.requestId ? { requestId: metadata.requestId } : undefined,
            organizationId,
            requestId: metadata.requestId
          }
        });

        return created;
      });

      return this.toPublicAttachment(attachment);
    } catch (error) {
      await this.objectStorage.deleteObject(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async createDownloadUrl(organizationId: string, attachmentId: string) {
    const attachment = await this.database.prisma.attachment.findFirst({
      include: attachmentInclude,
      where: { id: attachmentId, organizationId }
    });

    if (!attachment) {
      throw new NotFoundException("Attachment not found.");
    }

    const extension = attachment.safeFileName.split(".").at(-1) ?? "bin";
    const signed = await this.objectStorage.createSignedDownloadUrl({
      contentDisposition: `attachment; filename="attachment.${extension}"`,
      contentType: attachment.mimeType,
      storageKey: attachment.storageKey
    });

    return {
      downloadUrl: signed.downloadUrl,
      expiresAt: signed.expiresAt.toISOString()
    };
  }

  private createStorageKey(
    organizationId: string,
    journalEntryId: string,
    extension: string
  ): string {
    return `organizations/${organizationId}/journal-entries/${journalEntryId}/${randomUUID()}.${extension}`;
  }

  private requireDraft(status: JournalEntryStatus): void {
    if (status !== JournalEntryStatus.DRAFT) {
      throw new ConflictException("Attachments can only be added while a journal entry is a draft.");
    }
  }

  private toPublicAttachment(attachment: AttachmentWithUploader) {
    return {
      createdAt: attachment.createdAt,
      id: attachment.id,
      journalEntryId: attachment.journalEntryId,
      mimeType: attachment.mimeType,
      organizationId: attachment.organizationId,
      originalName: attachment.originalName,
      sha256: attachment.sha256,
      size: Number(attachment.size),
      uploadedBy: attachment.uploadedBy
        ? {
            displayName: attachment.uploadedBy.displayName,
            id: attachment.uploadedBy.id
          }
        : null
    };
  }
}

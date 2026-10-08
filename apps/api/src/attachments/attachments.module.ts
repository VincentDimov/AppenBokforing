import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { JournalEntriesModule } from "../journal-entries/journal-entries.module";
import { AttachmentResourceGuard } from "./attachment-resource.guard";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { OBJECT_STORAGE } from "./object-storage";
import { S3ObjectStorageService } from "./s3-object-storage.service";
import { OrganizationsModule } from "../organizations/organizations.module";
import { AttachmentArchiveController } from "./attachment-archive.controller";

@Module({
  imports: [DatabaseModule, JournalEntriesModule, OrganizationsModule],
  controllers: [AttachmentsController, AttachmentArchiveController],
  providers: [
    AttachmentResourceGuard,
    AttachmentsService,
    S3ObjectStorageService,
    {
      provide: OBJECT_STORAGE,
      useExisting: S3ObjectStorageService
    }
  ]
})
export class AttachmentsModule {}

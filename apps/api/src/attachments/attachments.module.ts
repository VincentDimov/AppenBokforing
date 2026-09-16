import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { JournalEntriesModule } from "../journal-entries/journal-entries.module";
import { AttachmentResourceGuard } from "./attachment-resource.guard";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { OBJECT_STORAGE } from "./object-storage";
import { S3ObjectStorageService } from "./s3-object-storage.service";

@Module({
  imports: [DatabaseModule, JournalEntriesModule],
  controllers: [AttachmentsController],
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

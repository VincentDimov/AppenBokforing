import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { JournalEntriesAccessService } from "./journal-entries-access.service";
import { JournalEntriesController } from "./journal-entries.controller";
import { JournalEntriesOrganizationGuard } from "./journal-entries-organization.guard";
import { JournalEntriesService } from "./journal-entries.service";
import { JournalEntryResourceGuard } from "./journal-entry-resource.guard";

@Module({
  imports: [DatabaseModule],
  controllers: [JournalEntriesController],
  providers: [
    JournalEntriesAccessService,
    JournalEntriesOrganizationGuard,
    JournalEntriesService,
    JournalEntryResourceGuard
  ],
  exports: [JournalEntriesAccessService, JournalEntryResourceGuard]
})
export class JournalEntriesModule {}

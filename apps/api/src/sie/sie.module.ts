import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { JournalEntriesModule } from "../journal-entries/journal-entries.module";
import { SieController } from "./sie.controller";
import { SieService } from "./sie.service";
import { OrganizationsModule } from "../organizations/organizations.module";
import { SieHistoryController } from "./sie-history.controller";
@Module({
  imports: [DatabaseModule, JournalEntriesModule, OrganizationsModule],
  controllers: [SieController, SieHistoryController],
  providers: [SieService]
})
export class SieModule {}

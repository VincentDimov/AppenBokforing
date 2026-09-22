import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { JournalEntriesModule } from "../journal-entries/journal-entries.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
@Module({
  imports: [DatabaseModule, JournalEntriesModule],
  controllers: [ReportsController],
  providers: [ReportsService]
})
export class ReportsModule {}

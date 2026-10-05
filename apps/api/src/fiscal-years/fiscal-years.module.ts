import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { JournalEntriesModule } from "../journal-entries/journal-entries.module";
import { JournalEntriesOrganizationGuard } from "../journal-entries/journal-entries-organization.guard";
import { FiscalYearsController } from "./fiscal-years.controller";
import { FiscalYearsService } from "./fiscal-years.service";
@Module({
  imports: [DatabaseModule, JournalEntriesModule],
  controllers: [FiscalYearsController],
  providers: [FiscalYearsService, JournalEntriesOrganizationGuard]
})
export class FiscalYearsModule {}

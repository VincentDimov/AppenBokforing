import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { JournalEntriesModule } from "../journal-entries/journal-entries.module";
import { SieController } from "./sie.controller";
import { SieService } from "./sie.service";
@Module({
  imports: [DatabaseModule, JournalEntriesModule],
  controllers: [SieController],
  providers: [SieService]
})
export class SieModule {}

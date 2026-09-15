import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { AccountResourceGuard } from "./account-resource.guard";
import { AccountsAccessService } from "./accounts-access.service";
import { AccountsController } from "./accounts.controller";
import { AccountsOrganizationGuard } from "./accounts-organization.guard";
import { AccountsService } from "./accounts.service";
import { LicensedChartOfAccountsImportService } from "./imports/licensed-chart-of-accounts";

@Module({
  imports: [DatabaseModule],
  controllers: [AccountsController],
  providers: [
    AccountResourceGuard,
    AccountsAccessService,
    AccountsOrganizationGuard,
    AccountsService,
    LicensedChartOfAccountsImportService
  ],
  exports: [AccountsService, LicensedChartOfAccountsImportService]
})
export class AccountsModule {}

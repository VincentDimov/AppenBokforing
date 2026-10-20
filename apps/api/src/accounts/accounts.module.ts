import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { AccountResourceGuard } from "./account-resource.guard";
import { AccountsAccessService } from "./accounts-access.service";
import { AccountsController } from "./accounts.controller";
import { AccountsOrganizationGuard } from "./accounts-organization.guard";
import { AccountsService } from "./accounts.service";
import { AccountBalancesService } from "./account-balances.service";
import { LicensedChartOfAccountsImportService } from "./imports/licensed-chart-of-accounts";
import { BasCatalogService } from "./bas/catalog.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AccountsController],
  providers: [
    AccountResourceGuard,
    AccountsAccessService,
    AccountsOrganizationGuard,
    AccountsService,
    AccountBalancesService,
    BasCatalogService,
    LicensedChartOfAccountsImportService
  ],
  exports: [AccountsService, BasCatalogService, LicensedChartOfAccountsImportService]
})
export class AccountsModule {}

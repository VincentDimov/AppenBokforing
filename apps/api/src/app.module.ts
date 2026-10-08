import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { HealthController } from "./health/health.controller";
import { ReadinessController } from "./health/readiness.controller";
import { AccountsModule } from "./accounts/accounts.module";
import { AttachmentsModule } from "./attachments/attachments.module";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { JournalEntriesModule } from "./journal-entries/journal-entries.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { ReportsModule } from "./reports/reports.module";
import { SieModule } from "./sie/sie.module";
import { AuditModule } from "./audit/audit.module";
import { FiscalYearsModule } from "./fiscal-years/fiscal-years.module";
import { PlatformAdminModule } from "./platform-admin/platform-admin.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ["../../.env", ".env"],
      isGlobal: true
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 100
        }
      ]
    }),
    DatabaseModule,
    AuthModule,
    OrganizationsModule,
    AccountsModule,
    JournalEntriesModule,
    AttachmentsModule,
    ReportsModule,
    SieModule,
    AuditModule,
    FiscalYearsModule,
    PlatformAdminModule
  ],
  controllers: [HealthController, ReadinessController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ]
})
export class AppModule {}

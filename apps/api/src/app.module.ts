import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { HealthController } from "./health/health.controller";
import { AccountsModule } from "./accounts/accounts.module";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { JournalEntriesModule } from "./journal-entries/journal-entries.module";
import { OrganizationsModule } from "./organizations/organizations.module";

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
    JournalEntriesModule
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ]
})
export class AppModule {}

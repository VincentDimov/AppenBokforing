import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";

import { DatabaseModule } from "../database/database.module";
import { AccessTokenGuard } from "./access-token.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthSettingsService } from "./auth-settings.service";

@Module({
  imports: [DatabaseModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthSettingsService,
    AuthService,
    AccessTokenGuard,
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard
    }
  ],
  exports: [AccessTokenGuard, AuthService, AuthSettingsService]
})
export class AuthModule {}

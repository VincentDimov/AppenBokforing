import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccountsModule } from "../accounts/accounts.module";
import {
  PlatformAdminController,
  PlatformAdminSecurityController
} from "./platform-admin.controller";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformAdminService } from "./platform-admin.service";

@Module({
  imports: [AuthModule, AccountsModule],
  controllers: [PlatformAdminController, PlatformAdminSecurityController],
  providers: [PlatformAdminGuard, PlatformAdminService]
})
export class PlatformAdminModule {}

import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { OrganizationMembershipGuard } from "./organization-membership.guard";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [DatabaseModule],
  controllers: [OrganizationsController],
  providers: [OrganizationMembershipGuard, OrganizationsService],
  exports: [OrganizationMembershipGuard, OrganizationsService]
})
export class OrganizationsModule {}

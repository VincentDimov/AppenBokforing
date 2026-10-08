import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { OrganizationMembershipGuard } from "./organization-membership.guard";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { OnboardingService } from "./onboarding.service";
import { OnboardingController } from "./onboarding.controller";
import { MembersService } from "./members.service";
import { MembersController, InvitationAcceptanceController } from "./members.controller";
import { InvitationDelivery } from "./invitation-delivery";
import { VoucherSeriesController } from "./voucher-series.controller";
import { VoucherSeriesService } from "./voucher-series.service";
import { OpeningBalancesController } from "./opening-balances.controller";
import { OpeningBalancesService } from "./opening-balances.service";
import { DimensionsController } from "./dimensions.controller";
import { DimensionsService } from "./dimensions.service";
import { PostingTemplatesController } from "./posting-templates.controller";
import { PostingTemplatesService } from "./posting-templates.service";

@Module({
  imports: [DatabaseModule],
  controllers: [
    OrganizationsController,
    OnboardingController,
    MembersController,
    InvitationAcceptanceController,
    VoucherSeriesController,
    OpeningBalancesController,
    DimensionsController,
    PostingTemplatesController
  ],
  providers: [
    OrganizationMembershipGuard,
    OrganizationsService,
    OnboardingService,
    MembersService,
    InvitationDelivery,
    VoucherSeriesService,
    OpeningBalancesService,
    DimensionsService,
    PostingTemplatesService
  ],
  exports: [OrganizationMembershipGuard, OrganizationsService]
})
export class OrganizationsModule {}

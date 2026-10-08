import { Body, Controller, Post, Req } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedRequest, AuthenticatedUser } from "../auth/auth.types";
import { OnboardingDto } from "./onboarding.dto";
import { OnboardingService } from "./onboarding.service";

@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OnboardingDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.service.create(user.id, dto, request.header("x-request-id")?.slice(0, 100));
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { OrganizationMembershipGuard } from "./organization-membership.guard";
import { RequireOrganizationPermission } from "./decorators/require-organization-permission.decorator";
import { SaveTemplateDto, TemplateQueryDto } from "./posting-templates.dto";
import { PostingTemplatesService } from "./posting-templates.service";
@Controller("organizations/:id/posting-templates")
@UseGuards(OrganizationMembershipGuard)
export class PostingTemplatesController {
  constructor(private readonly service: PostingTemplatesService) {}
  @Get() list(@Param("id") org: string, @Query() query: TemplateQueryDto): Promise<unknown> {
    return this.service.list(org, query);
  }
  @Get(":templateId") find(
    @Param("id") org: string,
    @Param("templateId", ParseUUIDPipe) id: string
  ): Promise<unknown> {
    return this.service.find(org, id);
  }
  @Post()
  @RequireOrganizationPermission("CREATE_BOOKKEEPING")
  create(
    @Param("id") org: string,
    @Body() dto: SaveTemplateDto,
    @Req() req: AuthenticatedRequest
  ): Promise<unknown> {
    return this.service.save(org, req.auth!.id, dto, undefined, req.header("x-request-id"));
  }
  @Patch(":templateId")
  @RequireOrganizationPermission("CREATE_BOOKKEEPING")
  update(
    @Param("id") org: string,
    @Param("templateId", ParseUUIDPipe) id: string,
    @Body() dto: SaveTemplateDto,
    @Req() req: AuthenticatedRequest
  ): Promise<unknown> {
    return this.service.save(org, req.auth!.id, dto, id, req.header("x-request-id"));
  }
  @Post(":templateId/apply")
  @RequireOrganizationPermission("CREATE_BOOKKEEPING")
  apply(@Param("id") org: string, @Param("templateId", ParseUUIDPipe) id: string) {
    return this.service.apply(org, id);
  }
}

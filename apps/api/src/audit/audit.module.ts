import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Module,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AuditAction, AuditEntityType, type Prisma } from "@ledgerapp/db";
import { IsEnum, IsInt, IsOptional, IsUUID, Matches, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { DatabaseService } from "../database/database.service";
import { DatabaseModule } from "../database/database.module";
import { JournalEntriesModule } from "../journal-entries/journal-entries.module";
import { JournalEntriesOrganizationGuard } from "../journal-entries/journal-entries-organization.guard";
import { RequireOrganizationPermission } from "../organizations/decorators/require-organization-permission.decorator";
import type { AuthenticatedRequest } from "../auth/auth.types";

export interface AuditHistory {
  events: Array<{
    id: string;
    organizationId: string;
    actorUserId: string | null;
    action: AuditAction;
    entityType: AuditEntityType;
    entityId: string | null;
    metadata: Prisma.JsonValue;
    timestamp: Date;
    requestId: string | null;
    actor: { displayName: string } | null;
  }>;
  page: number;
  hasMore: boolean;
}

export class AuditQueryDto {
  @IsUUID() organizationId!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) fromDate?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) toDate?: string;
  @IsOptional() @IsUUID() user?: string;
  @IsOptional() @IsEnum(AuditAction) action?: AuditAction;
  @IsOptional() @IsEnum(AuditEntityType) entityType?: AuditEntityType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
}

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}
  async list(organizationId: string, query: AuditQueryDto): Promise<AuditHistory> {
    const date = (value: string) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
        throw new BadRequestException("Invalid calendar date.");
      return parsed;
    };
    const from = query.fromDate ? date(query.fromDate) : undefined;
    const to = query.toDate ? date(query.toDate) : undefined;
    if (from && to && from > to)
      throw new BadRequestException("fromDate must be on or before toDate.");
    if (to) to.setUTCDate(to.getUTCDate() + 1);
    const records = await this.database.prisma.auditEvent.findMany({
      where: {
        organizationId,
        ...(query.user ? { actorUserId: query.user } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(from || to ? { createdAt: { gte: from, lt: to } } : {})
      },
      select: {
        id: true,
        organizationId: true,
        actorUserId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        requestId: true,
        actor: { select: { displayName: true } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * 50,
      take: 51
    });
    return {
      events: records
        .slice(0, 50)
        .map(({ createdAt, ...event }) => ({ ...event, timestamp: createdAt })),
      page: query.page,
      hasMore: records.length > 50
    };
  }
}

@Controller("audit-events")
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get()
  @UseGuards(JournalEntriesOrganizationGuard)
  @RequireOrganizationPermission("READ_BOOKKEEPING")
  list(@Query() query: AuditQueryDto, @Req() request: AuthenticatedRequest): Promise<AuditHistory> {
    const organizationId = request.organizationMembership?.organizationId;
    if (!organizationId) throw new Error("Audit history requires organization membership.");
    return this.audit.list(organizationId, query);
  }
}

@Module({
  imports: [DatabaseModule, JournalEntriesModule],
  controllers: [AuditController],
  providers: [AuditService]
})
export class AuditModule {}

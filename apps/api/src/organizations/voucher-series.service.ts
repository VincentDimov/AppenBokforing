import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma } from "@ledgerapp/db";
import { DatabaseService } from "../database/database.service";
import { requireOpenCalendar } from "../fiscal-years/accounting-calendar";
import { CreateSeriesDto, UpdateSeriesDto } from "./voucher-series.dto";
@Injectable()
export class VoucherSeriesService {
  constructor(private readonly db: DatabaseService) {}
  async list(org: string, fiscalYearId: string) {
    if (
      !(await this.db.prisma.fiscalYear.findFirst({
        where: { organizationId: org, id: fiscalYearId }
      }))
    )
      throw new NotFoundException("Fiscal year not found.");
    return this.db.prisma.voucherSeries.findMany({
      where: { organizationId: org, fiscalYearId },
      orderBy: { code: "asc" },
      include: { _count: { select: { journalEntries: true } } }
    });
  }
  async create(org: string, actor: string, dto: CreateSeriesDto, requestId?: string) {
    if (!dto.name.trim()) throw new BadRequestException("Name cannot be blank.");
    try {
      return await this.db.prisma.$transaction(async (tx) => {
        await requireOpenCalendar(tx, org, dto.fiscalYearId);
        const series = await tx.voucherSeries.create({
          data: { ...dto, name: dto.name.trim(), organizationId: org }
        });
        await this.audit(tx, org, actor, series.id, "CREATE", requestId);
        return series;
      });
    } catch (error) {
      this.conflict(error);
    }
  }
  async update(org: string, id: string, actor: string, dto: UpdateSeriesDto, requestId?: string) {
    if (dto.name !== undefined && !dto.name.trim())
      throw new BadRequestException("Name cannot be blank.");
    try {
      return await this.db.prisma.$transaction(async (tx) => {
        const initial = await tx.voucherSeries.findFirst({ where: { id, organizationId: org } });
        if (!initial) throw new NotFoundException("Series not found.");
        // Posting takes the same year lock before allocating a number. No active-state race.
        await requireOpenCalendar(tx, org, initial.fiscalYearId);
        await tx.$queryRaw`SELECT id FROM voucher_series WHERE id = ${id}::uuid AND organization_id = ${org}::uuid FOR UPDATE`;
        const current = await tx.voucherSeries.findUniqueOrThrow({ where: { id } });
        if (
          dto.code &&
          dto.code !== current.code &&
          (await tx.journalEntry.count({
            where: { organizationId: org, voucherSeriesId: id, status: "POSTED" }
          }))
        )
          throw new ConflictException({
            code: "VOUCHER_SERIES_IN_USE",
            message: "Seriekoden är låst efter första bokföringen."
          });
        const series = await tx.voucherSeries.update({
          where: { id },
          data: { ...dto, name: dto.name?.trim() }
        });
        await this.audit(tx, org, actor, id, "UPDATE", requestId);
        return series;
      });
    } catch (error) {
      this.conflict(error);
    }
  }
  private async audit(
    tx: Prisma.TransactionClient,
    org: string,
    actor: string,
    id: string,
    action: "CREATE" | "UPDATE",
    requestId?: string
  ) {
    const series = await tx.voucherSeries.findUniqueOrThrow({ where: { id } });
    return tx.auditEvent.create({
      data: {
        organizationId: org,
        actorUserId: actor,
        action,
        entityType: "VOUCHER_SERIES",
        entityId: id,
        requestId,
        metadata: {
          code: series.code,
          name: series.name,
          isActive: series.isActive,
          fiscalYearId: series.fiscalYearId
        }
      }
    });
  }
  private conflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new ConflictException({
        code: "SERIES_ALREADY_EXISTS",
        message: "Seriekoden finns redan i räkenskapsåret."
      });
    throw error;
  }
}

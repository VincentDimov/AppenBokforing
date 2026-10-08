import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@ledgerapp/db";
import { DatabaseService } from "../database/database.service";
import { CreateFiscalYearDto } from "./fiscal-years.dto";
import { requireOpenCalendar } from "./accounting-calendar";

export function monthlyPeriods(startDate: string, endDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))
    throw new BadRequestException("Use date-only YYYY-MM-DD values.");
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start.toISOString().slice(0, 10) !== startDate ||
    end.toISOString().slice(0, 10) !== endDate ||
    start > end
  )
    throw new BadRequestException("Invalid fiscal year dates.");
  const periods: { periodNumber: number; startDate: Date; endDate: Date }[] = [];
  let cursor = start;
  while (cursor <= end) {
    if (periods.length >= 13)
      throw new BadRequestException("Application limit: 13 monthly periods per fiscal year.");
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    periods.push({
      periodNumber: periods.length + 1,
      startDate: cursor,
      endDate: new Date(Math.min(end.getTime(), next.getTime() - 86_400_000))
    });
    cursor = next;
  }
  return periods;
}

@Injectable()
export class FiscalYearsService {
  constructor(private readonly database: DatabaseService) {}
  list(organizationId: string) {
    return this.database.prisma.fiscalYear.findMany({
      where: { organizationId },
      include: { accountingPeriods: { orderBy: { periodNumber: "asc" } } },
      orderBy: { startDate: "desc" }
    });
  }
  private async context(tx: Prisma.TransactionClient, actor: string, requestId?: string) {
    await tx.$executeRaw`SELECT set_config('ledgerapp.actor_user_id', ${actor}, true),
      set_config('ledgerapp.request_id', ${(requestId || randomUUID()).slice(0, 100)}, true)`;
  }
  async create(
    organizationId: string,
    actor: string,
    dto: CreateFiscalYearDto,
    requestId?: string
  ) {
    const periods = monthlyPeriods(dto.startDate, dto.endDate);
    if (!dto.name.trim()) throw new BadRequestException("Name cannot be blank.");
    return this.database.prisma.$transaction(async (tx) => {
      // Serialize calendar creation per tenant, including concurrent overlapping years.
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
      await this.context(tx, actor, requestId);
      const overlap = await tx.fiscalYear.findFirst({
        where: {
          organizationId,
          startDate: { lte: new Date(dto.endDate) },
          endDate: { gte: new Date(dto.startDate) }
        }
      });
      if (overlap) throw new ConflictException("Fiscal years cannot overlap.");
      return tx.fiscalYear.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          // The composite fiscalYear relation supplies both fiscalYearId and
          // organizationId. Its nested unchecked input excludes those keys.
          accountingPeriods: { create: periods }
        },
        include: { accountingPeriods: { orderBy: { periodNumber: "asc" } } }
      });
    });
  }
  async setPeriodStatus(
    organizationId: string,
    id: string,
    actor: string,
    lock: boolean,
    requestId?: string
  ) {
    return this.database.prisma.$transaction(async (tx) => {
      const period = await tx.accountingPeriod.findFirst({ where: { id, organizationId } });
      if (!period) throw new NotFoundException("Accounting period not found.");
      await requireOpenCalendar(tx, organizationId, period.fiscalYearId);
      const current = await tx.$queryRaw<
        { status: string }[]
      >`SELECT status FROM accounting_periods WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      if (current[0]?.status === (lock ? "LOCKED" : "OPEN"))
        return tx.accountingPeriod.findFirstOrThrow({ where: { id, organizationId } });
      await this.context(tx, actor, requestId);
      // Status-change audit is enforced by a database trigger in this transaction.
      return tx.accountingPeriod.update({
        where: { id },
        data: {
          status: lock ? "LOCKED" : "OPEN",
          lockedAt: lock ? new Date() : null,
          lockedById: lock ? actor : null
        }
      });
    });
  }
  async close(organizationId: string, id: string, actor: string, requestId?: string) {
    return this.database.prisma.$transaction(async (tx) => {
      await requireOpenCalendar(tx, organizationId, id);
      const periods = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM accounting_periods WHERE fiscal_year_id = ${id}::uuid
          AND organization_id = ${organizationId}::uuid ORDER BY period_number FOR UPDATE`;
      if (!periods.length || periods.some((period) => period.status !== "LOCKED"))
        throw new ConflictException("All periods must be locked before closing the fiscal year.");
      if (
        await tx.journalEntry.count({
          where: { organizationId, fiscalYearId: id, status: "DRAFT" }
        })
      )
        throw new ConflictException("Resolve all draft vouchers before closing the fiscal year.");
      await this.context(tx, actor, requestId);
      const year = await tx.fiscalYear.update({
        where: { id },
        data: { status: "CLOSED", closedAt: new Date(), closedById: actor }
      });
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId: actor,
          requestId: requestId?.slice(0, 100) || randomUUID(),
          action: "LOCK",
          entityType: "FISCAL_YEAR",
          entityId: id,
          metadata: { previousStatus: "OPEN", status: "CLOSED" }
        }
      });
      return year;
    });
  }
}

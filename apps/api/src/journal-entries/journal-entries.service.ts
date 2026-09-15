import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  AccountingPeriodStatus,
  AuditAction,
  AuditEntityType,
  FiscalYearStatus,
  JournalEntryStatus,
  Prisma,
  PrismaClient
} from "@ledgerapp/db";

import { DatabaseService } from "../database/database.service";
import { CreateJournalEntryDto } from "./dto/create-journal-entry.dto";
import { JournalEntryOptionsQueryDto } from "./dto/journal-entry-options-query.dto";
import { JournalLineDto } from "./dto/journal-line.dto";
import { ListJournalEntriesQueryDto } from "./dto/list-journal-entries-query.dto";
import { UpdateJournalEntryDto } from "./dto/update-journal-entry.dto";

interface JournalEntryAuditMetadata {
  ipAddress?: string;
  requestId?: string;
}

interface CalendarScope {
  accountingPeriodId: string;
  fiscalYearId: string;
}

interface PreparedJournalLine {
  accountId: string;
  costCenterId: string | null;
  creditAmount: Prisma.Decimal;
  debitAmount: Prisma.Decimal;
  description: string | null;
  projectId: string | null;
  vatCodeId: string | null;
}

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const journalEntryInclude = {
  accountingPeriod: {
    select: {
      endDate: true,
      id: true,
      periodNumber: true,
      startDate: true,
      status: true
    }
  },
  fiscalYear: {
    select: {
      endDate: true,
      id: true,
      name: true,
      startDate: true,
      status: true
    }
  },
  lines: {
    include: {
      account: {
        select: { accountNumber: true, id: true, name: true }
      },
      costCenter: {
        select: { code: true, id: true, name: true }
      },
      project: {
        select: { code: true, id: true, name: true }
      },
      vatCode: {
        select: { code: true, id: true, name: true, rate: true }
      }
    },
    orderBy: { lineNumber: "asc" }
  },
  voucherSeries: {
    select: { code: true, id: true, name: true }
  }
} satisfies Prisma.JournalEntryInclude;

type JournalEntryWithRelations = Prisma.JournalEntryGetPayload<{
  include: typeof journalEntryInclude;
}>;

const maxPostingAttempts = 3;

/**
 * The only write path for manual bookkeeping. Amounts stay Prisma.Decimal all
 * the way through validation, aggregation and persistence.
 */
@Injectable()
export class JournalEntriesService {
  constructor(private readonly database: DatabaseService) {}

  async list(organizationId: string, query: ListJournalEntriesQueryDto) {
    const entries = await this.database.prisma.journalEntry.findMany({
      include: journalEntryInclude,
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      where: {
        organizationId,
        ...(query.status ? { status: query.status } : {})
      }
    });

    return entries.map((entry) => this.toPublicEntry(entry));
  }

  async findOne(organizationId: string, journalEntryId: string) {
    const entry = await this.findDetailed(this.database.prisma, organizationId, journalEntryId);

    if (!entry) {
      throw new NotFoundException("Journal entry not found.");
    }

    return this.toPublicEntry(entry);
  }

  async getOptions(organizationId: string, query: JournalEntryOptionsQueryDto) {
    const calendar = await this.resolveCalendar(
      this.database.prisma,
      organizationId,
      query.transactionDate
    );
    const [fiscalYear, accountingPeriod, voucherSeries] = await Promise.all([
      this.database.prisma.fiscalYear.findFirstOrThrow({
        select: { endDate: true, id: true, name: true, startDate: true, status: true },
        where: { id: calendar.fiscalYearId, organizationId }
      }),
      this.database.prisma.accountingPeriod.findFirstOrThrow({
        select: { endDate: true, id: true, periodNumber: true, startDate: true, status: true },
        where: { id: calendar.accountingPeriodId, organizationId }
      }),
      this.database.prisma.voucherSeries.findMany({
        orderBy: { code: "asc" },
        select: { code: true, id: true, name: true },
        where: { fiscalYearId: calendar.fiscalYearId, isActive: true, organizationId }
      })
    ]);

    return {
      accountingPeriod: {
        endDate: this.toDateOnly(accountingPeriod.endDate),
        id: accountingPeriod.id,
        periodNumber: accountingPeriod.periodNumber,
        startDate: this.toDateOnly(accountingPeriod.startDate),
        status: accountingPeriod.status
      },
      fiscalYear: {
        endDate: this.toDateOnly(fiscalYear.endDate),
        id: fiscalYear.id,
        name: fiscalYear.name,
        startDate: this.toDateOnly(fiscalYear.startDate),
        status: fiscalYear.status
      },
      voucherSeries
    };
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateJournalEntryDto,
    metadata: JournalEntryAuditMetadata
  ) {
    const entry = await this.database.prisma.$transaction(async (transaction) => {
      const prepared = await this.prepareDraftInput(transaction, organizationId, dto);
      const created = await transaction.journalEntry.create({
        data: {
          accountingPeriodId: prepared.calendar.accountingPeriodId,
          createdById: actorUserId,
          description: prepared.description,
          entryDate: prepared.entryDate,
          fiscalYearId: prepared.calendar.fiscalYearId,
          lines: {
            create: prepared.lines.map((line, index) => ({
              ...line,
              lineNumber: index + 1
            }))
          },
          organizationId,
          voucherSeriesId: prepared.voucherSeriesId
        },
        include: journalEntryInclude
      });

      await this.writeAuditEvent(transaction, created, actorUserId, AuditAction.CREATE, metadata);

      return created;
    });

    return this.toPublicEntry(entry);
  }

  async update(
    organizationId: string,
    journalEntryId: string,
    actorUserId: string,
    dto: UpdateJournalEntryDto,
    metadata: JournalEntryAuditMetadata
  ) {
    if (
      dto.voucherSeriesId === undefined &&
      dto.transactionDate === undefined &&
      dto.description === undefined &&
      dto.lines === undefined
    ) {
      throw new BadRequestException("Provide at least one journal entry field to update.");
    }

    const entry = await this.database.prisma.$transaction(async (transaction) => {
      const before = await this.findDetailed(transaction, organizationId, journalEntryId);

      if (!before) {
        throw new NotFoundException("Journal entry not found.");
      }

      this.requireDraft(before.status);
      const voucherSeriesId = dto.voucherSeriesId ?? before.voucherSeriesId;

      if (!voucherSeriesId) {
        throw new ConflictException("A voucher series is required before updating a draft.");
      }

      const prepared = await this.prepareDraftInput(transaction, organizationId, {
        description: dto.description ?? before.description,
        lines: dto.lines ?? this.toLineDtos(before),
        transactionDate: dto.transactionDate ?? this.toDateOnly(before.entryDate),
        voucherSeriesId
      });

      const updated = await transaction.journalEntry.update({
        data: {
          accountingPeriodId: prepared.calendar.accountingPeriodId,
          description: prepared.description,
          entryDate: prepared.entryDate,
          fiscalYearId: prepared.calendar.fiscalYearId,
          ...(dto.lines === undefined
            ? {}
            : {
                lines: {
                  create: prepared.lines.map((line, index) => ({
                    ...line,
                    lineNumber: index + 1
                  })),
                  deleteMany: {}
                }
              }),
          voucherSeriesId: prepared.voucherSeriesId
        },
        include: journalEntryInclude,
        where: { id: journalEntryId }
      });

      await this.writeAuditEvent(
        transaction,
        updated,
        actorUserId,
        AuditAction.UPDATE,
        metadata,
        before
      );

      return updated;
    });

    return this.toPublicEntry(entry);
  }

  async post(
    organizationId: string,
    journalEntryId: string,
    actorUserId: string,
    metadata: JournalEntryAuditMetadata
  ) {
    for (let attempt = 0; attempt < maxPostingAttempts; attempt += 1) {
      try {
        const entry = await this.database.prisma.$transaction(
          (transaction) =>
            this.postInTransaction(
              transaction,
              organizationId,
              journalEntryId,
              actorUserId,
              metadata
            ),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5_000,
            timeout: 10_000
          }
        );

        return this.toPublicEntry(entry);
      } catch (error) {
        if (this.isSerializationFailure(error) && attempt < maxPostingAttempts - 1) {
          continue;
        }

        if (this.isUniqueConstraint(error)) {
          throw new ConflictException("Voucher number allocation conflicted. Please retry.");
        }

        throw error;
      }
    }

    throw new ConflictException("Voucher number allocation conflicted. Please retry.");
  }

  private async postInTransaction(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    journalEntryId: string,
    actorUserId: string,
    metadata: JournalEntryAuditMetadata
  ): Promise<JournalEntryWithRelations> {
    const lockedEntries = await transaction.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "journal_entries"
      WHERE "id" = ${journalEntryId}::uuid
        AND "organization_id" = ${organizationId}::uuid
      FOR UPDATE
    `;

    if (lockedEntries.length !== 1) {
      throw new NotFoundException("Journal entry not found.");
    }

    const before = await this.findDetailed(transaction, organizationId, journalEntryId);

    if (!before) {
      throw new NotFoundException("Journal entry not found.");
    }

    this.requireDraft(before.status);
    await this.requireOpenPostingCalendar(transaction, organizationId, before);
    this.requirePostableLines(before.lines);
    await this.requireActivePersistedReferences(transaction, organizationId, before);

    if (!before.voucherSeriesId) {
      throw new ConflictException("A voucher series is required before posting.");
    }

    const allocated = await transaction.$queryRaw<{ voucherNumber: number }[]>`
      UPDATE "voucher_series"
      SET "next_voucher_number" = "next_voucher_number" + 1,
          "updated_at" = NOW()
      WHERE "id" = ${before.voucherSeriesId}::uuid
        AND "organization_id" = ${organizationId}::uuid
        AND "fiscal_year_id" = ${before.fiscalYearId}::uuid
        AND "is_active" = TRUE
      RETURNING "next_voucher_number" - 1 AS "voucherNumber"
    `;

    if (allocated.length !== 1 || allocated[0].voucherNumber < 1) {
      throw new ConflictException("Voucher series is inactive or unavailable.");
    }

    const posted = await transaction.journalEntry.update({
      data: {
        postedAt: new Date(),
        postedById: actorUserId,
        status: JournalEntryStatus.POSTED,
        voucherNumber: allocated[0].voucherNumber
      },
      include: journalEntryInclude,
      where: { id: journalEntryId }
    });

    await this.writeAuditEvent(
      transaction,
      posted,
      actorUserId,
      AuditAction.POST,
      metadata,
      before
    );

    return posted;
  }

  private async prepareDraftInput(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    dto: Pick<
      CreateJournalEntryDto,
      "description" | "lines" | "transactionDate" | "voucherSeriesId"
    >
  ) {
    const description = dto.description.trim();

    if (!description) {
      throw new BadRequestException("description cannot be blank.");
    }

    const entryDate = this.parseDate(dto.transactionDate);
    const calendar = await this.resolveCalendar(transaction, organizationId, dto.transactionDate);
    const voucherSeries = await transaction.voucherSeries.findFirst({
      select: { id: true },
      where: {
        fiscalYearId: calendar.fiscalYearId,
        id: dto.voucherSeriesId,
        isActive: true,
        organizationId
      }
    });

    if (!voucherSeries) {
      throw new NotFoundException("Voucher series not found.");
    }

    return {
      calendar,
      description,
      entryDate,
      lines: await this.prepareLines(transaction, organizationId, dto.lines),
      voucherSeriesId: voucherSeries.id
    };
  }

  private async prepareLines(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    lines: JournalLineDto[]
  ): Promise<PreparedJournalLine[]> {
    if (lines.length === 0) {
      throw new BadRequestException("At least one journal line is required.");
    }

    const accountsById = await this.resolveActiveAccounts(transaction, organizationId, lines);
    const vatCodesByCode = await this.resolveActiveCodeDimension(
      transaction.vatCode,
      organizationId,
      lines.map((line) => line.vatCode)
    );
    const projectsByCode = await this.resolveActiveCodeDimension(
      transaction.project,
      organizationId,
      lines.map((line) => line.projectCode)
    );
    const costCentersByCode = await this.resolveActiveCodeDimension(
      transaction.costCenter,
      organizationId,
      lines.map((line) => line.costCenterCode)
    );

    return lines.map((line) => {
      const debitAmount = this.toDecimal(line.debit, "debit");
      const creditAmount = this.toDecimal(line.credit, "credit");

      if (
        (debitAmount.gt(0) && creditAmount.gt(0)) ||
        (debitAmount.isZero() && creditAmount.isZero())
      ) {
        throw new BadRequestException(
          "Each journal line must have exactly one positive debit or credit amount."
        );
      }

      return {
        accountId: accountsById.get(line.accountId)!,
        costCenterId: line.costCenterCode ? costCentersByCode.get(line.costCenterCode)! : null,
        creditAmount,
        debitAmount,
        description: line.description?.trim() || null,
        projectId: line.projectCode ? projectsByCode.get(line.projectCode)! : null,
        vatCodeId: line.vatCode ? vatCodesByCode.get(line.vatCode)! : null
      };
    });
  }

  private async resolveActiveAccounts(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    lines: JournalLineDto[]
  ): Promise<Map<string, string>> {
    const ids = [...new Set(lines.map((line) => line.accountId))];
    const accounts = await transaction.account.findMany({
      select: { id: true },
      where: { id: { in: ids }, isActive: true, organizationId }
    });

    if (accounts.length !== ids.length) {
      throw new NotFoundException(
        "One or more accounts are missing, inactive, or outside the organization."
      );
    }

    return new Map(accounts.map((account) => [account.id, account.id]));
  }

  private async resolveActiveCodeDimension(
    model: {
      findMany(args: {
        select: { id: true; code: true };
        where: { code: { in: string[] }; isActive: boolean; organizationId: string };
      }): Promise<{ code: string; id: string }[]>;
    },
    organizationId: string,
    requestedCodes: Array<string | null | undefined>
  ): Promise<Map<string, string>> {
    const codes = [...new Set(requestedCodes.filter((code): code is string => Boolean(code)))];

    if (codes.length === 0) {
      return new Map();
    }

    const records = await model.findMany({
      select: { code: true, id: true },
      where: { code: { in: codes }, isActive: true, organizationId }
    });

    if (records.length !== codes.length) {
      throw new NotFoundException(
        "One or more VAT codes, projects, or cost centers are missing, inactive, or outside the organization."
      );
    }

    return new Map(records.map((record) => [record.code, record.id]));
  }

  private async resolveCalendar(
    client: DatabaseClient,
    organizationId: string,
    transactionDate: string
  ): Promise<CalendarScope> {
    const entryDate = this.parseDate(transactionDate);
    const fiscalYears = await client.fiscalYear.findMany({
      select: { id: true },
      where: {
        endDate: { gte: entryDate },
        organizationId,
        startDate: { lte: entryDate }
      }
    });

    if (fiscalYears.length !== 1) {
      throw new BadRequestException("transactionDate must belong to exactly one fiscal year.");
    }

    const accountingPeriods = await client.accountingPeriod.findMany({
      select: { id: true },
      where: {
        endDate: { gte: entryDate },
        fiscalYearId: fiscalYears[0].id,
        organizationId,
        startDate: { lte: entryDate }
      }
    });

    if (accountingPeriods.length !== 1) {
      throw new BadRequestException(
        "transactionDate must belong to exactly one accounting period."
      );
    }

    return {
      accountingPeriodId: accountingPeriods[0].id,
      fiscalYearId: fiscalYears[0].id
    };
  }

  private async requireOpenPostingCalendar(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    entry: JournalEntryWithRelations
  ) {
    const fiscalYears = await transaction.$queryRaw<
      { endDate: Date; startDate: Date; status: FiscalYearStatus }[]
    >`
      SELECT "start_date" AS "startDate", "end_date" AS "endDate", "status"
      FROM "fiscal_years"
      WHERE "id" = ${entry.fiscalYearId}::uuid
        AND "organization_id" = ${organizationId}::uuid
      FOR UPDATE
    `;
    const periods = await transaction.$queryRaw<
      { endDate: Date; startDate: Date; status: AccountingPeriodStatus }[]
    >`
      SELECT "start_date" AS "startDate", "end_date" AS "endDate", "status"
      FROM "accounting_periods"
      WHERE "id" = ${entry.accountingPeriodId}::uuid
        AND "organization_id" = ${organizationId}::uuid
        AND "fiscal_year_id" = ${entry.fiscalYearId}::uuid
      FOR UPDATE
    `;

    if (fiscalYears.length !== 1 || periods.length !== 1) {
      throw new ConflictException("The journal entry calendar scope is no longer available.");
    }

    const fiscalYear = fiscalYears[0];
    const period = periods[0];
    const entryDate = entry.entryDate.getTime();

    if (
      fiscalYear.status !== FiscalYearStatus.OPEN ||
      period.status !== AccountingPeriodStatus.OPEN ||
      entryDate < fiscalYear.startDate.getTime() ||
      entryDate > fiscalYear.endDate.getTime() ||
      entryDate < period.startDate.getTime() ||
      entryDate > period.endDate.getTime()
    ) {
      throw new ConflictException(
        "The fiscal year or accounting period is closed, locked, or does not contain the transaction date."
      );
    }
  }

  private requirePostableLines(entryLines: JournalEntryWithRelations["lines"]) {
    if (entryLines.length < 2) {
      throw new BadRequestException("A posted journal entry must contain at least two lines.");
    }

    const totals = this.calculateTotals(entryLines);

    if (!totals.debit.gt(0) || !totals.debit.equals(totals.credit)) {
      throw new BadRequestException("Total debit must exactly equal total credit before posting.");
    }
  }

  private async requireActivePersistedReferences(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    entry: JournalEntryWithRelations
  ) {
    const accountIds = [...new Set(entry.lines.map((line) => line.accountId))];
    const vatCodeIds = [
      ...new Set(entry.lines.flatMap((line) => (line.vatCodeId ? [line.vatCodeId] : [])))
    ];
    const projectIds = [
      ...new Set(entry.lines.flatMap((line) => (line.projectId ? [line.projectId] : [])))
    ];
    const costCenterIds = [
      ...new Set(entry.lines.flatMap((line) => (line.costCenterId ? [line.costCenterId] : [])))
    ];
    const [accounts, vatCodes, projects, costCenters] = await Promise.all([
      transaction.account.count({
        where: { id: { in: accountIds }, isActive: true, organizationId }
      }),
      transaction.vatCode.count({
        where: { id: { in: vatCodeIds }, isActive: true, organizationId }
      }),
      transaction.project.count({
        where: { id: { in: projectIds }, isActive: true, organizationId }
      }),
      transaction.costCenter.count({
        where: { id: { in: costCenterIds }, isActive: true, organizationId }
      })
    ]);

    if (
      accounts !== accountIds.length ||
      vatCodes !== vatCodeIds.length ||
      projects !== projectIds.length ||
      costCenters !== costCenterIds.length
    ) {
      throw new ConflictException(
        "A referenced account, VAT code, project, or cost center is no longer active in this organization."
      );
    }
  }

  private async findDetailed(
    client: DatabaseClient,
    organizationId: string,
    journalEntryId: string
  ): Promise<JournalEntryWithRelations | null> {
    return client.journalEntry.findFirst({
      include: journalEntryInclude,
      where: { id: journalEntryId, organizationId }
    });
  }

  private async writeAuditEvent(
    transaction: Prisma.TransactionClient,
    entry: JournalEntryWithRelations,
    actorUserId: string,
    action: AuditAction,
    metadata: JournalEntryAuditMetadata,
    before?: JournalEntryWithRelations
  ) {
    await transaction.auditEvent.create({
      data: {
        action,
        actorUserId,
        afterData: this.toAuditData(entry),
        beforeData: before ? this.toAuditData(before) : undefined,
        entityId: entry.id,
        entityType: AuditEntityType.JOURNAL_ENTRY,
        ipAddress: metadata.ipAddress,
        metadata: metadata.requestId ? { requestId: metadata.requestId } : undefined,
        organizationId: entry.organizationId,
        requestId: metadata.requestId
      }
    });
  }

  private toLineDtos(entry: JournalEntryWithRelations): JournalLineDto[] {
    return entry.lines.map((line) => ({
      accountId: line.accountId,
      costCenterCode: line.costCenter?.code ?? null,
      credit: this.toMoneyString(line.creditAmount),
      debit: this.toMoneyString(line.debitAmount),
      description: line.description,
      projectCode: line.project?.code ?? null,
      vatCode: line.vatCode?.code ?? null
    }));
  }

  private toPublicEntry(entry: JournalEntryWithRelations) {
    const totals = this.calculateTotals(entry.lines);

    return {
      accountingPeriod: {
        endDate: this.toDateOnly(entry.accountingPeriod.endDate),
        id: entry.accountingPeriod.id,
        periodNumber: entry.accountingPeriod.periodNumber,
        startDate: this.toDateOnly(entry.accountingPeriod.startDate),
        status: entry.accountingPeriod.status
      },
      createdAt: entry.createdAt,
      description: entry.description,
      fiscalYear: {
        endDate: this.toDateOnly(entry.fiscalYear.endDate),
        id: entry.fiscalYear.id,
        name: entry.fiscalYear.name,
        startDate: this.toDateOnly(entry.fiscalYear.startDate),
        status: entry.fiscalYear.status
      },
      id: entry.id,
      lines: entry.lines.map((line) => ({
        account: {
          id: line.account.id,
          name: line.account.name,
          number: line.account.accountNumber
        },
        costCenter: line.costCenter,
        credit: this.toMoneyString(line.creditAmount),
        debit: this.toMoneyString(line.debitAmount),
        description: line.description,
        id: line.id,
        lineNumber: line.lineNumber,
        project: line.project,
        vatCode: line.vatCode
          ? {
              ...line.vatCode,
              rate: line.vatCode.rate.toString()
            }
          : null
      })),
      organizationId: entry.organizationId,
      postedAt: entry.postedAt,
      status: entry.status,
      totals: {
        credit: this.toMoneyString(totals.credit),
        debit: this.toMoneyString(totals.debit),
        difference: this.toMoneyString(totals.debit.minus(totals.credit))
      },
      transactionDate: this.toDateOnly(entry.entryDate),
      updatedAt: entry.updatedAt,
      voucherNumber: entry.voucherNumber,
      voucherSeries: entry.voucherSeries
    };
  }

  private toAuditData(entry: JournalEntryWithRelations): Prisma.InputJsonValue {
    const totals = this.calculateTotals(entry.lines);

    return {
      description: entry.description,
      lines: entry.lines.map((line) => ({
        accountId: line.accountId,
        costCenterId: line.costCenterId,
        credit: this.toMoneyString(line.creditAmount),
        debit: this.toMoneyString(line.debitAmount),
        description: line.description,
        lineNumber: line.lineNumber,
        projectId: line.projectId,
        vatCodeId: line.vatCodeId
      })),
      status: entry.status,
      totals: {
        credit: this.toMoneyString(totals.credit),
        debit: this.toMoneyString(totals.debit)
      },
      transactionDate: this.toDateOnly(entry.entryDate),
      voucherNumber: entry.voucherNumber,
      voucherSeriesId: entry.voucherSeriesId
    };
  }

  private calculateTotals(
    lines: Array<{ creditAmount: Prisma.Decimal; debitAmount: Prisma.Decimal }>
  ) {
    return lines.reduce(
      (totals, line) => ({
        credit: totals.credit.plus(line.creditAmount),
        debit: totals.debit.plus(line.debitAmount)
      }),
      { credit: new Prisma.Decimal(0), debit: new Prisma.Decimal(0) }
    );
  }

  private requireDraft(status: JournalEntryStatus) {
    if (status !== JournalEntryStatus.DRAFT) {
      throw new ConflictException("Posted or reversed journal entries cannot be changed.");
    }
  }

  private parseDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime()) || this.toDateOnly(date) !== value) {
      throw new BadRequestException("transactionDate must be a real YYYY-MM-DD date.");
    }

    return date;
  }

  private toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private toDecimal(value: string, field: string): Prisma.Decimal {
    try {
      const decimal = new Prisma.Decimal(value);

      if (decimal.isNegative() || decimal.decimalPlaces() > 2) {
        throw new Error("invalid money amount");
      }

      return decimal;
    } catch {
      throw new BadRequestException(`${field} must be a non-negative decimal amount.`);
    }
  }

  private toMoneyString(value: Prisma.Decimal): string {
    return value.toFixed(2);
  }

  private isSerializationFailure(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    // Prisma exposes serializable conflicts from query-builder operations as
    // P2034, but raw PostgreSQL UPDATE ... RETURNING reports SQLSTATE 40001
    // wrapped in P2010. Both are safe to retry before a voucher is committed.
    return (
      error.code === "P2034" ||
      (error.code === "P2010" &&
        typeof error.meta === "object" &&
        error.meta !== null &&
        "code" in error.meta &&
        error.meta.code === "40001")
    );
  }

  private isUniqueConstraint(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}

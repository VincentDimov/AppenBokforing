import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@ledgerapp/db";
import { DatabaseService } from "../database/database.service";
import { assertAccountsEligible } from "../accounts/bas/eligibility";
import { requireOpenCalendar } from "../fiscal-years/accounting-calendar";
import { readAccountingContext, readPostedMovements } from "../reports/accounting-report-data";
import {
  balanceSides,
  emptyMovement,
  rawBalance,
  rollForward,
  zeroBalance
} from "../accounting/accounting-balances";
import { CarryForwardDto, SaveOpeningBalancesDto } from "./opening-balances.dto";

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
@Injectable()
export class OpeningBalancesService {
  constructor(private readonly db: DatabaseService) {}
  async list(org: string, fiscalYearId: string) {
    return this.db.prisma.$transaction(
      async (tx) => {
        const context = await readAccountingContext(tx, org, fiscalYearId);
        const balances = await this.rows(tx, org, fiscalYearId);
        const bookable = new Set(
          (
            await tx.$queryRaw<
              { id: string }[]
            >`SELECT id FROM accounts WHERE organization_id=${org}::uuid AND is_active AND bas_account_eligible(organization_id,account_number,bas_catalog_account_id)`
          ).map((account) => account.id)
        );
        return {
          fiscalYear: context.fiscalYear,
          fingerprint: fingerprint(balances),
          accounts: context.accounts
            .filter((account) => ["ASSET", "LIABILITY", "EQUITY"].includes(account.type))
            .map((account) => ({ ...account, bookable: bookable.has(account.id) })),
          rows: balances.map((row) => ({
            ...row,
            debitAmount: row.debitAmount.toFixed(2),
            creditAmount: row.creditAmount.toFixed(2)
          })),
          totals: context.openingTotals,
          editable:
            !(await tx.journalEntry.count({
              where: { organizationId: org, fiscalYearId, status: "POSTED" }
            })) &&
            !(await tx.accountingPeriod.count({
              where: { organizationId: org, fiscalYearId, status: "LOCKED" }
            }))
        };
      },
      { isolationLevel: "RepeatableRead" }
    );
  }
  private rows(tx: Prisma.TransactionClient, organizationId: string, fiscalYearId: string) {
    return tx.openingBalance.findMany({
      where: { organizationId, fiscalYearId },
      orderBy: { accountId: "asc" },
      select: { id: true, accountId: true, debitAmount: true, creditAmount: true, updatedAt: true }
    });
  }
  private async writable(tx: Prisma.TransactionClient, org: string, year: string) {
    try {
      await requireOpenCalendar(tx, org, year);
    } catch (error) {
      if (error instanceof ConflictException)
        throw new ConflictException({
          code: "OPENING_BALANCE_LOCKED",
          message: "IB kan inte ändras i ett stängt räkenskapsår."
        });
      throw error;
    }
    if (
      (await tx.accountingPeriod.count({
        where: { organizationId: org, fiscalYearId: year, status: "LOCKED" }
      })) ||
      (await tx.journalEntry.count({
        where: { organizationId: org, fiscalYearId: year, status: "POSTED" }
      }))
    )
      throw new ConflictException({
        code: "OPENING_BALANCE_LOCKED",
        message: "IB är låst efter första bokföringen eller periodlåsningen."
      });
  }
  private async lockAccounts(tx: Prisma.TransactionClient, org: string) {
    await tx.$queryRaw`SELECT id FROM accounts WHERE organization_id = ${org}::uuid ORDER BY id FOR SHARE`;
  }
  private async validate(
    tx: Prisma.TransactionClient,
    org: string,
    rows: { accountId: string; debit: string; credit: string }[]
  ) {
    const accounts = await tx.account.findMany({
      where: { organizationId: org, id: { in: rows.map((row) => row.accountId) } }
    });
    const byId = new Map(accounts.map((account) => [account.id, account]));
    const seen = new Set<string>();
    let debit = zeroBalance(),
      credit = zeroBalance();
    for (const row of rows) {
      const account = byId.get(row.accountId);
      const d = new Prisma.Decimal(row.debit),
        c = new Prisma.Decimal(row.credit);
      if (
        !account ||
        !["ASSET", "LIABILITY", "EQUITY"].includes(account.type) ||
        seen.has(row.accountId)
      )
        throw new BadRequestException({
          code: "OPENING_BALANCE_ACCOUNT_INVALID",
          message: "IB kräver unika aktiva balanskonton från organisationen."
        });
      if (!account.isActive && (!d.isZero() || !c.isZero()))
        throw new BadRequestException("IB kräver ett aktivt konto för icke-nollbelopp.");
      if (
        d.lt(0) ||
        c.lt(0) ||
        d.decimalPlaces() > 2 ||
        c.decimalPlaces() > 2 ||
        (d.gt(0) && c.gt(0))
      )
        throw new BadRequestException("IB-rad måste vara icke-negativ och enkelsidig.");
      seen.add(row.accountId);
      debit = debit.plus(d);
      credit = credit.plus(c);
    }
    await assertAccountsEligible(
      tx,
      org,
      rows
        .filter(
          (row) =>
            !new Prisma.Decimal(row.debit).isZero() || !new Prisma.Decimal(row.credit).isZero()
        )
        .map((row) => row.accountId)
    );
    if (!debit.equals(credit))
      throw new BadRequestException({
        code: "OPENING_BALANCE_UNBALANCED",
        message: "IB:s debet och kredit måste vara exakt lika."
      });
    return { debit: debit.toFixed(2), credit: credit.toFixed(2) };
  }
  async save(org: string, actor: string, dto: SaveOpeningBalancesDto, requestId?: string) {
    return this.db.prisma.$transaction(async (tx) => {
      await this.writable(tx, org, dto.fiscalYearId);
      await this.lockAccounts(tx, org);
      const before = await this.rows(tx, org, dto.fiscalYearId);
      if (fingerprint(before) !== dto.expectedFingerprint)
        throw new ConflictException({
          code: "OPENING_BALANCE_VERSION_CONFLICT",
          message: "IB har ändrats. Läs om innan du sparar."
        });
      const totals = await this.validate(tx, org, dto.rows);
      await tx.openingBalance.deleteMany({
        where: { organizationId: org, fiscalYearId: dto.fiscalYearId }
      });
      const nonzero = dto.rows.filter(
        (row) => !new Prisma.Decimal(row.debit).isZero() || !new Prisma.Decimal(row.credit).isZero()
      );
      await tx.openingBalance.createMany({
        data: nonzero.map((row) => ({
          organizationId: org,
          fiscalYearId: dto.fiscalYearId,
          accountId: row.accountId,
          debitAmount: row.debit,
          creditAmount: row.credit,
          createdById: actor
        }))
      });
      await this.audit(
        tx,
        org,
        actor,
        dto.fiscalYearId,
        "OPENING_BALANCES_SAVED",
        {
          accountIds: [
            ...new Set([
              ...before.map((row) => row.accountId),
              ...nonzero.map((row) => row.accountId)
            ])
          ],
          totals
        },
        requestId
      );
      return { totals, fingerprint: fingerprint(await this.rows(tx, org, dto.fiscalYearId)) };
    });
  }
  private async calculate(tx: Prisma.TransactionClient, org: string, dto: CarryForwardDto) {
    if (dto.sourceFiscalYearId === dto.targetFiscalYearId)
      throw new BadRequestException("Välj två olika räkenskapsår.");
    // All competing calendar and IB writers use these year locks; UUID order is stable.
    for (const id of [dto.sourceFiscalYearId, dto.targetFiscalYearId].sort())
      await tx.$queryRaw`SELECT id FROM fiscal_years WHERE id = ${id}::uuid AND organization_id = ${org}::uuid FOR UPDATE`;
    const source = await tx.fiscalYear.findFirst({
      where: { id: dto.sourceFiscalYearId, organizationId: org }
    });
    const target = await tx.fiscalYear.findFirst({
      where: { id: dto.targetFiscalYearId, organizationId: org }
    });
    if (!source || !target) throw new NotFoundException("Fiscal year not found.");
    if (source.status !== "CLOSED")
      throw new ConflictException({
        code: "CARRY_FORWARD_SOURCE_OPEN",
        message: "Källåret måste vara stängt före årsöverföring."
      });
    if (target.startDate.getTime() !== source.endDate.getTime() + 86400_000)
      throw new BadRequestException("Målåret måste börja dagen efter källåret.");
    await this.writable(tx, org, target.id);
    await this.lockAccounts(tx, org);
    if (
      (await tx.openingBalance.count({
        where: { organizationId: org, fiscalYearId: target.id }
      })) ||
      (await tx.yearCarryForward.count({
        where: { organizationId: org, targetFiscalYearId: target.id, confirmedAt: { not: null } }
      }))
    )
      throw new ConflictException({
        code: "CARRY_FORWARD_TARGET_EXISTS",
        message: "Målåret har redan IB eller en bekräftad överföring. Ingen överskrivning görs."
      });
    const context = await readAccountingContext(tx, org, source.id);
    const resultAccount = await tx.account.findFirst({
      where: { id: dto.resultAccountId, organizationId: org, type: "EQUITY", isActive: true }
    });
    if (!resultAccount)
      throw new BadRequestException("Välj ett aktivt eget-kapital-konto för årets resultat.");
    await assertAccountsEligible(tx, org, [resultAccount.id]);
    const movements = await readPostedMovements(
      tx,
      org,
      source.id,
      source.startDate,
      source.endDate
    );
    const balances = new Map<string, Prisma.Decimal>();
    let resultNet = zeroBalance();
    let fullNet = zeroBalance();
    for (const account of context.accounts) {
      const movement = movements.get(account.id) ?? emptyMovement();
      const closing = rollForward(context.opening.get(account.id) ?? zeroBalance(), movement);
      fullNet = fullNet.plus(closing);
      if (["REVENUE", "EXPENSE"].includes(account.type))
        resultNet = resultNet.plus(rawBalance(movement.debit, movement.credit));
      else balances.set(account.id, closing);
    }
    if (!fullNet.isZero()) throw new ConflictException("Källårets bokföringsdata är obalanserade.");
    balances.set(
      resultAccount.id,
      (balances.get(resultAccount.id) ?? zeroBalance()).plus(resultNet)
    );
    const rows = context.accounts
      .filter((account) => balances.has(account.id))
      .map((account) => {
        const net = balances.get(account.id)!;
        const sides = balanceSides(net);
        return {
          accountId: account.id,
          number: account.accountNumber,
          name: account.name,
          closingBalance: rollForward(
            context.opening.get(account.id) ?? zeroBalance(),
            movements.get(account.id) ?? emptyMovement()
          ).toFixed(2),
          debit: sides.debit.toFixed(2),
          credit: sides.credit.toFixed(2)
        };
      })
      .filter((row) => row.debit !== "0.00" || row.credit !== "0.00");
    const totals = await this.validate(tx, org, rows);
    const state = {
      source: {
        id: source.id,
        startDate: source.startDate,
        endDate: source.endDate,
        status: source.status
      },
      target: {
        id: target.id,
        startDate: target.startDate,
        endDate: target.endDate,
        status: target.status
      },
      resultAccountId: resultAccount.id,
      resultNet: resultNet.toFixed(2),
      rows,
      totals,
      accounts: context.accounts
    };
    return { ...state, fingerprint: fingerprint(state) };
  }
  async preview(org: string, actor: string, dto: CarryForwardDto) {
    return this.db.prisma.$transaction(async (tx) => {
      const data = await this.calculate(tx, org, dto);
      const preview = await tx.yearCarryForward.create({
        data: {
          organizationId: org,
          ...dto,
          createdById: actor,
          fingerprint: data.fingerprint,
          expiresAt: new Date(Date.now() + 15 * 60_000)
        }
      });
      return { ...data, previewId: preview.id, expiresAt: preview.expiresAt };
    });
  }
  async confirm(org: string, actor: string, previewId: string, requestId?: string) {
    return this.db.prisma.$transaction(async (tx) => {
      const preview = await tx.yearCarryForward.findFirst({
        where: { id: previewId, organizationId: org, createdById: actor }
      });
      if (!preview) throw new NotFoundException("Preview not found.");
      if (preview.expiresAt <= new Date())
        throw new ConflictException({
          code: "CARRY_FORWARD_PREVIEW_EXPIRED",
          message: "Förhandsgranskningen har löpt ut."
        });
      const data = await this.calculate(tx, org, preview);
      if (data.fingerprint !== preview.fingerprint)
        throw new ConflictException({
          code: "CARRY_FORWARD_SOURCE_CHANGED",
          message: "Underlaget har ändrats. Skapa en ny förhandsgranskning."
        });
      await tx.openingBalance.createMany({
        data: data.rows.map((row) => ({
          organizationId: org,
          fiscalYearId: preview.targetFiscalYearId,
          accountId: row.accountId,
          debitAmount: row.debit,
          creditAmount: row.credit,
          createdById: actor
        }))
      });
      await tx.yearCarryForward.update({
        where: { id: previewId },
        data: { confirmedAt: new Date() }
      });
      await this.audit(
        tx,
        org,
        actor,
        preview.targetFiscalYearId,
        "CARRY_FORWARD_CONFIRMED",
        {
          sourceFiscalYearId: preview.sourceFiscalYearId,
          previewId,
          resultAccountId: preview.resultAccountId,
          totals: data.totals,
          accountCount: data.rows.length
        },
        requestId
      );
      return { fiscalYearId: preview.targetFiscalYearId, totals: data.totals };
    });
  }
  private audit(
    tx: Prisma.TransactionClient,
    org: string,
    actor: string,
    year: string,
    operation: string,
    summary: Prisma.InputJsonObject,
    requestId?: string
  ) {
    return tx.auditEvent.create({
      data: {
        organizationId: org,
        actorUserId: actor,
        entityId: year,
        entityType: "OPENING_BALANCE",
        action: "UPDATE",
        requestId,
        metadata: { operation, fiscalYearId: year, ...summary }
      }
    });
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountType, JournalEntryStatus, Prisma } from "@ledgerapp/db";

import { DatabaseService } from "../database/database.service";
import { GeneralLedgerQueryDto } from "./dto/general-ledger-query.dto";
import { IncomeStatementQueryDto } from "./dto/income-statement-query.dto";
import { BalanceSheetQueryDto } from "./dto/balance-sheet-query.dto";
import { VatReportQueryDto } from "./dto/vat-report-query.dto";
import { calculateVatReport, type VatReportLine } from "../vat/vat-reporting-engine";
import { mapSwedishVatReport } from "../vat/swedish-vat-configuration";

import { incomeGroups } from "./income-groups";
import { TrialBalanceQueryDto } from "./dto/trial-balance-query.dto";
import {
  balanceSides,
  emptyMovement,
  presentationBalance,
  rawBalance,
  rollForward,
  zeroBalance
} from "../accounting/accounting-balances";
import {
  accountingDataError,
  readAccountingContext,
  readPostedMovements,
  requireReportInterval
} from "./accounting-report-data";

@Injectable()
export class ReportsService {
  constructor(private readonly database: DatabaseService) {}

  async generalLedger(organizationId: string, query: GeneralLedgerQueryDto) {
    return this.snapshot((tx) => this.generalLedgerSnapshot(tx, organizationId, query));
  }

  private async generalLedgerSnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
    query: GeneralLedgerQueryDto
  ) {
    const fromDate = this.asUtcDate(query.fromDate);
    const toDate = this.asUtcDate(query.toDate);
    if (fromDate > toDate) {
      throw new BadRequestException("fromDate must be on or before toDate.");
    }
    if (query.accountFrom && query.accountTo && query.accountFrom > query.accountTo) {
      throw new BadRequestException("accountFrom must be on or before accountTo.");
    }

    const {
      fiscalYear,
      accounts: allAccounts,
      opening,
      openingTotals
    } = await readAccountingContext(tx, organizationId, query.fiscalYear);
    requireReportInterval(fiscalYear, fromDate, toDate);
    // IB has no dimensional allocation. Refuse ambiguous blends, rather than inventing one.
    if (
      (query.project || query.costCenter) &&
      [...opening.values()].some((value) => !value.isZero())
    )
      accountingDataError(
        "UNALLOCATED_OPENING_BALANCE",
        "Opening balances have no project/cost-center allocation. Run this ledger without dimension filters."
      );
    const accounts = allAccounts.filter(
      (account) =>
        (!query.accountFrom || account.accountNumber >= query.accountFrom) &&
        (!query.accountTo || account.accountNumber <= query.accountTo)
    );
    const beforeTo = new Date(fromDate);
    beforeTo.setUTCDate(beforeTo.getUTCDate() - 1);
    const before =
      fromDate > fiscalYear.startDate
        ? await readPostedMovements(
            tx,
            organizationId,
            fiscalYear.id,
            fiscalYear.startDate,
            beforeTo,
            query
          )
        : new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    const lines = await tx.journalLine.findMany({
      take: 20001,
      select: {
        accountId: true,
        debitAmount: true,
        creditAmount: true,
        description: true,
        journalEntry: {
          select: {
            description: true,
            entryDate: true,
            status: true,
            voucherNumber: true,
            voucherSeries: { select: { code: true } }
          }
        }
      },
      orderBy: [
        { journalEntry: { entryDate: "asc" } },
        { journalEntry: { voucherSeriesId: "asc" } },
        { journalEntry: { voucherNumber: "asc" } },
        { journalEntryId: "asc" },
        { lineNumber: "asc" },
        { id: "asc" }
      ],
      where: {
        accountId: { in: accounts.map((account) => account.id) },
        organizationId,
        ...(query.project ? { project: { code: query.project } } : {}),
        ...(query.costCenter ? { costCenter: { code: query.costCenter } } : {}),
        journalEntry: {
          organizationId,
          fiscalYearId: query.fiscalYear,
          status: JournalEntryStatus.POSTED,
          entryDate: { gte: fromDate, lte: toDate }
        }
      }
    });
    if (lines.length > 20000)
      accountingDataError(
        "REPORT_TOO_LARGE",
        "Limit the ledger interval/account filters; maximum 20,000 journal lines per report."
      );
    const byAccount = new Map(
      accounts.map((account) => [
        account.id,
        {
          account,
          fiscalYearOpening: opening.get(account.id) ?? zeroBalance(),
          opening: rollForward(
            opening.get(account.id) ?? zeroBalance(),
            before.get(account.id) ?? emptyMovement()
          ),
          transactions: [] as typeof lines
        }
      ])
    );
    for (const line of lines) {
      const bucket = byAccount.get(line.accountId)!;
      bucket.transactions.push(line);
    }
    return {
      fiscalYear,
      openingBalancePolicy: "FISCAL_YEAR_UNALLOCATED",
      fiscalYearOpeningTotals: openingTotals,
      fromDate: query.fromDate,
      toDate: query.toDate,
      accounts: [...byAccount.values()].map(
        ({ account, fiscalYearOpening, opening, transactions }) => {
          let running = opening;
          const mapped = transactions.map((line) => {
            running = running.plus(rawBalance(line.debitAmount, line.creditAmount));
            return {
              date: line.journalEntry.entryDate.toISOString().slice(0, 10),
              description: line.description ?? line.journalEntry.description,
              debit: line.debitAmount.toFixed(2),
              credit: line.creditAmount.toFixed(2),
              runningBalance: running.toFixed(2),
              voucher: line.journalEntry.voucherNumber
                ? `${line.journalEntry.voucherSeries?.code ?? ""}${line.journalEntry.voucherNumber}`
                : null
            };
          });
          return {
            account: {
              id: account.id,
              number: account.accountNumber,
              name: account.name,
              normalBalance: account.normalBalance
            },
            fiscalYearOpeningBalance: fiscalYearOpening.toFixed(2),
            beforePeriodNet: opening.minus(fiscalYearOpening).toFixed(2),
            openingBalance: opening.toFixed(2),
            transactions: mapped,
            closingBalance: running.toFixed(2)
          };
        }
      )
    };
  }

  async incomeStatement(organizationId: string, query: IncomeStatementQueryDto) {
    return this.snapshot((tx) => this.incomeStatementSnapshot(tx, organizationId, query));
  }
  private async incomeStatementSnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
    query: IncomeStatementQueryDto
  ) {
    const fromDate = this.asUtcDate(query.fromDate);
    const toDate = this.asUtcDate(query.toDate);
    if (fromDate > toDate) throw new BadRequestException("fromDate must be on or before toDate.");

    const fiscalYear = await tx.fiscalYear.findFirst({
      select: { endDate: true, id: true, name: true, startDate: true },
      where: { id: query.fiscalYear, organizationId }
    });
    if (!fiscalYear) throw new NotFoundException("Fiscal year not found.");
    if (fromDate < fiscalYear.startDate || toDate > fiscalYear.endDate) {
      throw new BadRequestException("The report interval must be within the selected fiscal year.");
    }

    const accounts = await tx.account.findMany({
      where: { organizationId, type: { in: [AccountType.REVENUE, AccountType.EXPENSE] } },
      take: 10001,
      orderBy: { accountNumber: "asc" },
      select: { id: true, accountNumber: true, name: true, type: true }
    });
    if (accounts.length > 10000)
      accountingDataError("REPORT_TOO_LARGE", "Maximum 10,000 income accounts per report.");
    const [period, accumulated] = await Promise.all([
      readPostedMovements(tx, organizationId, fiscalYear.id, fromDate, toDate, query),
      readPostedMovements(tx, organizationId, fiscalYear.id, fiscalYear.startDate, toDate, query)
    ]);
    const groups = incomeGroups(accounts, period, accumulated);
    const revenue = groups[0]!;
    const expenses = groups[1]!;
    return {
      fiscalYear: { id: fiscalYear.id, name: fiscalYear.name },
      fromDate: query.fromDate,
      toDate: query.toDate,
      groups,
      totals: {
        periodResult: rawBalance(
          new Prisma.Decimal(revenue.periodTotal),
          new Prisma.Decimal(expenses.periodTotal)
        ).toFixed(2),
        yearToDateResult: rawBalance(
          new Prisma.Decimal(revenue.yearToDateTotal),
          new Prisma.Decimal(expenses.yearToDateTotal)
        ).toFixed(2)
      }
    };
  }

  async balanceSheet(organizationId: string, query: BalanceSheetQueryDto) {
    return this.snapshot(async (tx) => {
      const reportDate = this.asUtcDate(query.reportDate);
      const comparisonDate = query.comparisonDate
        ? this.asUtcDate(query.comparisonDate)
        : undefined;
      const context = await readAccountingContext(tx, organizationId, query.fiscalYear);
      requireReportInterval(context.fiscalYear, context.fiscalYear.startDate, reportDate);
      if (comparisonDate) requireReportInterval(context.fiscalYear, comparisonDate, reportDate);
      const current = await readPostedMovements(
        tx,
        organizationId,
        query.fiscalYear,
        context.fiscalYear.startDate,
        reportDate
      );
      const comparison = comparisonDate
        ? await readPostedMovements(
            tx,
            organizationId,
            query.fiscalYear,
            context.fiscalYear.startDate,
            comparisonDate
          )
        : new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
      const net = (id: string, movements: typeof current) =>
        rollForward(context.opening.get(id) ?? zeroBalance(), movements.get(id) ?? emptyMovement());
      const result = (movements: typeof current) =>
        context.accounts
          .filter(
            (account) =>
              account.type === AccountType.REVENUE || account.type === AccountType.EXPENSE
          )
          .reduce(
            (sum, account) =>
              sum.minus(
                rawBalance(
                  (movements.get(account.id) ?? emptyMovement()).debit,
                  (movements.get(account.id) ?? emptyMovement()).credit
                )
              ),
            zeroBalance()
          );
      const groups = (
        [
          [AccountType.ASSET, "Tillgångar"],
          [AccountType.EQUITY, "Eget kapital"],
          [AccountType.LIABILITY, "Skulder"]
        ] as const
      ).map(([type, label]) => {
        const accounts = context.accounts
          .filter((account) => account.type === type)
          .map((account) => ({
            number: account.accountNumber,
            name: account.name,
            amount: presentationBalance(net(account.id, current), type).toFixed(2),
            comparisonAmount: comparisonDate
              ? presentationBalance(net(account.id, comparison), type).toFixed(2)
              : "0.00"
          }));
        if (type === AccountType.EQUITY)
          accounts.push({
            number: "ÅRETS_RESULTAT",
            name: "Årets resultat",
            amount: result(current).toFixed(2),
            comparisonAmount: comparisonDate ? result(comparison).toFixed(2) : "0.00"
          });
        return {
          key: type,
          label,
          accounts,
          total: accounts
            .reduce((sum, account) => sum.plus(account.amount), zeroBalance())
            .toFixed(2),
          comparisonTotal: accounts
            .reduce((sum, account) => sum.plus(account.comparisonAmount), zeroBalance())
            .toFixed(2)
        };
      });
      const assets = zeroBalance().plus(groups[0]!.total);
      const equityAndLiabilities = zeroBalance().plus(groups[1]!.total).plus(groups[2]!.total);
      const comparisonAssets = zeroBalance().plus(groups[0]!.comparisonTotal);
      const comparisonEquityAndLiabilities = zeroBalance()
        .plus(groups[1]!.comparisonTotal)
        .plus(groups[2]!.comparisonTotal);
      if (
        !assets.equals(equityAndLiabilities) ||
        !comparisonAssets.equals(comparisonEquityAndLiabilities)
      )
        accountingDataError(
          "UNBALANCED_ACCOUNTING_DATA",
          "Balance sheet does not reconcile. No balancing adjustment has been inserted."
        );
      return {
        fiscalYear: { id: context.fiscalYear.id, name: context.fiscalYear.name },
        fiscalYearOpeningTotals: context.openingTotals,
        reportDate: query.reportDate,
        comparisonDate: query.comparisonDate ?? null,
        groups,
        totals: {
          assets: assets.toFixed(2),
          equityAndLiabilities: equityAndLiabilities.toFixed(2),
          difference: assets.minus(equityAndLiabilities).toFixed(2),
          comparisonAssets: comparisonAssets.toFixed(2),
          comparisonEquityAndLiabilities: comparisonEquityAndLiabilities.toFixed(2),
          comparisonDifference: comparisonAssets.minus(comparisonEquityAndLiabilities).toFixed(2)
        }
      };
    });
  }

  async trialBalance(organizationId: string, query: TrialBalanceQueryDto) {
    return this.snapshot(async (tx) => {
      const fromDate = this.asUtcDate(query.fromDate),
        toDate = this.asUtcDate(query.toDate);
      const context = await readAccountingContext(tx, organizationId, query.fiscalYear);
      requireReportInterval(context.fiscalYear, fromDate, toDate);
      const beforeTo = new Date(fromDate);
      beforeTo.setUTCDate(beforeTo.getUTCDate() - 1);
      const before =
        fromDate > context.fiscalYear.startDate
          ? await readPostedMovements(
              tx,
              organizationId,
              query.fiscalYear,
              context.fiscalYear.startDate,
              beforeTo
            )
          : new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
      const period = await readPostedMovements(
        tx,
        organizationId,
        query.fiscalYear,
        fromDate,
        toDate
      );
      const accounts = context.accounts.map((account) => {
        const openingNet = rollForward(
          context.opening.get(account.id) ?? zeroBalance(),
          before.get(account.id) ?? emptyMovement()
        );
        const movement = period.get(account.id) ?? emptyMovement();
        const opening = balanceSides(openingNet),
          closing = balanceSides(rollForward(openingNet, movement));
        return {
          id: account.id,
          number: account.accountNumber,
          name: account.name,
          openingDebit: opening.debit.toFixed(2),
          openingCredit: opening.credit.toFixed(2),
          periodDebit: movement.debit.toFixed(2),
          periodCredit: movement.credit.toFixed(2),
          closingDebit: closing.debit.toFixed(2),
          closingCredit: closing.credit.toFixed(2)
        };
      });
      const fields = [
        "openingDebit",
        "openingCredit",
        "periodDebit",
        "periodCredit",
        "closingDebit",
        "closingCredit"
      ] as const;
      const totals = Object.fromEntries(
        fields.map((field) => [
          field,
          accounts.reduce((sum, account) => sum.plus(account[field]), zeroBalance()).toFixed(2)
        ])
      ) as Record<(typeof fields)[number], string>;
      for (const [debit, credit] of [
        ["openingDebit", "openingCredit"],
        ["periodDebit", "periodCredit"],
        ["closingDebit", "closingCredit"]
      ] as const)
        if (totals[debit] !== totals[credit])
          accountingDataError(
            "UNBALANCED_ACCOUNTING_DATA",
            "Trial balance debit and credit totals do not reconcile."
          );
      return {
        fiscalYear: { id: context.fiscalYear.id, name: context.fiscalYear.name },
        fromDate: query.fromDate,
        toDate: query.toDate,
        fiscalYearOpeningTotals: context.openingTotals,
        accounts,
        totals
      };
    });
  }

  private snapshot<T>(read: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.database.prisma.$transaction(read, {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
    });
  }

  async vat(organizationId: string, query: VatReportQueryDto) {
    return this.snapshot((tx) => this.vatSnapshot(tx, organizationId, query));
  }

  private async vatSnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
    query: VatReportQueryDto
  ) {
    const fromDate = this.asUtcDate(query.fromDate);
    const toDate = this.asUtcDate(query.toDate);
    if (fromDate > toDate) throw new BadRequestException("fromDate must be on or before toDate.");
    const fiscalYear = await tx.fiscalYear.findFirst({
      select: { endDate: true, id: true, name: true, startDate: true },
      where: { id: query.fiscalYear, organizationId }
    });
    if (!fiscalYear) throw new NotFoundException("Fiscal year not found.");
    if (fromDate < fiscalYear.startDate || toDate > fiscalYear.endDate) {
      throw new BadRequestException("The report interval must be within the selected fiscal year.");
    }
    const lines = await tx.journalLine.findMany({
      take: 20001,
      include: {
        account: { select: { accountNumber: true, name: true, vatCodeId: true } },
        journalEntry: {
          select: {
            entryDate: true,
            voucherNumber: true,
            voucherSeries: { select: { code: true } }
          }
        },
        vatCode: { select: { code: true, id: true, name: true, rate: true, type: true } }
      },
      orderBy: [{ journalEntry: { entryDate: "asc" } }, { lineNumber: "asc" }],
      where: {
        organizationId,
        journalEntry: {
          organizationId,
          fiscalYearId: fiscalYear.id,
          status: JournalEntryStatus.POSTED,
          entryDate: { gte: fromDate, lte: toDate }
        }
      }
    });
    if (lines.length > 20000)
      accountingDataError(
        "REPORT_TOO_LARGE",
        "Limit the VAT report interval; maximum 20,000 journal lines per report."
      );
    const report = calculateVatReport(
      lines.map((line): VatReportLine => ({
        account: line.account,
        accountId: line.accountId,
        creditAmount: line.creditAmount,
        debitAmount: line.debitAmount,
        entryDate: line.journalEntry.entryDate,
        journalEntryId: line.journalEntryId,
        vatRole: line.vatRole,
        vatGroup: line.vatGroup,
        vatSnapshot: line.vatSnapshot,
        vatCodeId: line.vatCodeId,
        voucherLabel: line.journalEntry.voucherNumber
          ? `${line.journalEntry.voucherSeries?.code ?? ""}${line.journalEntry.voucherNumber}`
          : null
      }))
    );
    return {
      fiscalYear: { id: fiscalYear.id, name: fiscalYear.name },
      fromDate: query.fromDate,
      toDate: query.toDate,
      swedishReturn: mapSwedishVatReport(report, query.fromDate, query.toDate),
      ...report
    };
  }

  async dashboard(organizationId: string, query: IncomeStatementQueryDto) {
    if (query.project || query.costCenter)
      throw new BadRequestException(
        "Dashboard dimension filters are not supported; use the income statement for dimensional reports."
      );
    return this.snapshot(async (tx) => {
      const income = await this.incomeStatementSnapshot(tx, organizationId, query);
      const context = await readAccountingContext(tx, organizationId, query.fiscalYear);
      const vat = await this.vatSnapshot(tx, organizationId, query);
      // One PostgreSQL aggregation, not all journal lines loaded into Node.
      const monthly = await tx.$queryRaw<
        { month: Date; accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal }[]
      >`
        SELECT date_trunc('month', e.entry_date)::date AS month, l.account_id AS "accountId",
          sum(l.debit_amount) AS debit, sum(l.credit_amount) AS credit
        FROM journal_lines l JOIN journal_entries e ON e.id=l.journal_entry_id AND e.organization_id=l.organization_id
        JOIN accounts a ON a.id=l.account_id AND a.organization_id=l.organization_id
        WHERE l.organization_id=${organizationId}::uuid AND e.fiscal_year_id=${query.fiscalYear}::uuid AND e.status='POSTED'
          AND a.type IN ('REVENUE','EXPENSE') AND e.entry_date >= ${context.fiscalYear.startDate} AND e.entry_date <= ${context.fiscalYear.endDate}
          AND (${query.project ?? null}::text IS NULL OR EXISTS(SELECT 1 FROM projects p WHERE p.id=l.project_id AND p.organization_id=l.organization_id AND p.code=${query.project ?? null}))
          AND (${query.costCenter ?? null}::text IS NULL OR EXISTS(SELECT 1 FROM cost_centers c WHERE c.id=l.cost_center_id AND c.organization_id=l.organization_id AND c.code=${query.costCenter ?? null}))
        GROUP BY date_trunc('month',e.entry_date),l.account_id ORDER BY month,l.account_id
      `;
      const chart: { month: string; revenue: string; expenses: string; result: string }[] = [];
      const cursor = new Date(
        Date.UTC(
          context.fiscalYear.startDate.getUTCFullYear(),
          context.fiscalYear.startDate.getUTCMonth(),
          1
        )
      );
      while (cursor <= context.fiscalYear.endDate) {
        if (chart.length >= 24)
          accountingDataError(
            "REPORT_TOO_LARGE",
            "Dashboard supports fiscal years up to 24 calendar months."
          );
        const month = cursor.toISOString().slice(0, 7),
          moves = new Map(
            monthly
              .filter((row) => row.month.toISOString().slice(0, 7) === month)
              .map((row) => [row.accountId, { debit: row.debit, credit: row.credit }])
          );
        const groups = incomeGroups(context.accounts, moves, moves);
        chart.push({
          month,
          revenue: groups[0]!.periodTotal,
          expenses: groups[1]!.periodTotal,
          result: new Prisma.Decimal(groups[0]!.periodTotal)
            .minus(groups[1]!.periodTotal)
            .toFixed(2)
        });
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
      const where: Prisma.JournalEntryWhereInput = {
        organizationId,
        fiscalYearId: query.fiscalYear,
        entryDate: { gte: this.asUtcDate(query.fromDate), lte: this.asUtcDate(query.toDate) }
      };
      const [drafts, posted, recent] = await Promise.all([
        tx.journalEntry.count({ where: { ...where, status: "DRAFT" } }),
        tx.journalEntry.count({ where: { ...where, status: "POSTED" } }),
        tx.journalEntry.findMany({
          where,
          take: 8,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            description: true,
            status: true,
            entryDate: true,
            voucherNumber: true,
            reversesEntryId: true,
            reversedByEntry: { select: { id: true } },
            voucherSeries: { select: { code: true } }
          }
        })
      ]);
      return {
        organizationId,
        fiscalYear: context.fiscalYear,
        fromDate: query.fromDate,
        toDate: query.toDate,
        filters: { project: query.project ?? null, costCenter: query.costCenter ?? null },
        kpis: {
          revenue: income.groups[0]!.periodTotal,
          expenses: income.groups[1]!.periodTotal,
          result: income.totals.periodResult,
          inputVat: vat.totals.inputVat,
          outputVat: vat.totals.outputVat,
          vatPosition: vat.totals.vatPosition,
          drafts,
          posted
        },
        vatStatus: {
          anomalies: vat.anomalies.length,
          warnings: vat.swedishReturn.warnings,
          configurationVersion: vat.swedishReturn.configurationVersion
        },
        chart,
        recent,
        hasOpeningBalances: context.opening.size > 0,
        generatedAt: new Date().toISOString()
      };
    });
  }

  private asUtcDate(value: string) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException("Dates must be valid calendar dates in YYYY-MM-DD format.");
    }
    return parsed;
  }
}

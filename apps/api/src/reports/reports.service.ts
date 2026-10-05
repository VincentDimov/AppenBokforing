import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountType, JournalEntryStatus, Prisma } from "@ledgerapp/db";

import { DatabaseService } from "../database/database.service";
import { GeneralLedgerQueryDto } from "./dto/general-ledger-query.dto";
import { IncomeStatementQueryDto } from "./dto/income-statement-query.dto";
import { BalanceSheetQueryDto } from "./dto/balance-sheet-query.dto";
import { VatReportQueryDto } from "./dto/vat-report-query.dto";
import { calculateVatReport, type VatReportLine } from "../vat/vat-reporting-engine";

@Injectable()
export class ReportsService {
  constructor(private readonly database: DatabaseService) {}

  async generalLedger(organizationId: string, query: GeneralLedgerQueryDto) {
    const fromDate = this.asUtcDate(query.fromDate);
    const toDate = this.asUtcDate(query.toDate);
    if (fromDate > toDate) {
      throw new BadRequestException("fromDate must be on or before toDate.");
    }
    if (query.accountFrom && query.accountTo && query.accountFrom > query.accountTo) {
      throw new BadRequestException("accountFrom must be on or before accountTo.");
    }

    const [fiscalYear, accounts] = await Promise.all([
      this.database.prisma.fiscalYear.findFirst({
        select: { endDate: true, id: true, name: true, startDate: true },
        where: { id: query.fiscalYear, organizationId }
      }),
      this.database.prisma.account.findMany({
        orderBy: { accountNumber: "asc" },
        select: { accountNumber: true, id: true, name: true, normalBalance: true },
        where: {
          organizationId,
          ...(query.accountFrom || query.accountTo
            ? {
                accountNumber: {
                  ...(query.accountFrom ? { gte: query.accountFrom } : {}),
                  ...(query.accountTo ? { lte: query.accountTo } : {})
                }
              }
            : {})
        }
      })
    ]);
    if (!fiscalYear) throw new NotFoundException("Fiscal year not found.");
    if (fromDate < fiscalYear.startDate || toDate > fiscalYear.endDate) {
      throw new BadRequestException("The report interval must be within the selected fiscal year.");
    }
    if (!accounts.length)
      return { accounts: [], fiscalYear, fromDate: query.fromDate, toDate: query.toDate };

    const lines = await this.database.prisma.journalLine.findMany({
      include: {
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
        { journalEntry: { voucherNumber: "asc" } },
        { lineNumber: "asc" }
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
          entryDate: { lte: toDate }
        }
      }
    });
    const byAccount = new Map(
      accounts.map((account) => [
        account.id,
        { account, opening: new Prisma.Decimal(0), transactions: [] as typeof lines }
      ])
    );
    for (const line of lines) {
      const bucket = byAccount.get(line.accountId)!;
      if (line.journalEntry.entryDate < fromDate)
        bucket.opening = bucket.opening.plus(line.debitAmount).minus(line.creditAmount);
      else bucket.transactions.push(line);
    }
    return {
      fiscalYear,
      fromDate: query.fromDate,
      toDate: query.toDate,
      accounts: [...byAccount.values()].map(({ account, opening, transactions }) => {
        let running = opening;
        const mapped = transactions.map((line) => {
          running = running.plus(line.debitAmount).minus(line.creditAmount);
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
          openingBalance: opening.toFixed(2),
          transactions: mapped,
          closingBalance: running.toFixed(2)
        };
      })
    };
  }

  async incomeStatement(organizationId: string, query: IncomeStatementQueryDto) {
    const fromDate = this.asUtcDate(query.fromDate);
    const toDate = this.asUtcDate(query.toDate);
    if (fromDate > toDate) throw new BadRequestException("fromDate must be on or before toDate.");

    const fiscalYear = await this.database.prisma.fiscalYear.findFirst({
      select: { endDate: true, id: true, name: true, startDate: true },
      where: { id: query.fiscalYear, organizationId }
    });
    if (!fiscalYear) throw new NotFoundException("Fiscal year not found.");
    if (fromDate < fiscalYear.startDate || toDate > fiscalYear.endDate) {
      throw new BadRequestException("The report interval must be within the selected fiscal year.");
    }

    const lines = await this.database.prisma.journalLine.findMany({
      include: {
        account: { select: { accountNumber: true, id: true, name: true, type: true } },
        journalEntry: { select: { entryDate: true } }
      },
      where: {
        organizationId,
        account: { type: { in: [AccountType.REVENUE, AccountType.EXPENSE] } },
        ...(query.project ? { project: { code: query.project } } : {}),
        ...(query.costCenter ? { costCenter: { code: query.costCenter } } : {}),
        journalEntry: {
          organizationId,
          fiscalYearId: fiscalYear.id,
          status: JournalEntryStatus.POSTED,
          entryDate: { gte: fiscalYear.startDate, lte: toDate }
        }
      }
    });
    type Bucket = {
      account: (typeof lines)[number]["account"];
      period: Prisma.Decimal;
      yearToDate: Prisma.Decimal;
    };
    const buckets = new Map<string, Bucket>();
    for (const line of lines) {
      const bucket = buckets.get(line.accountId) ?? {
        account: line.account,
        period: new Prisma.Decimal(0),
        yearToDate: new Prisma.Decimal(0)
      };
      // Income is shown positive for credits, expenses positive for debits.
      const amount =
        line.account.type === AccountType.REVENUE
          ? line.creditAmount.minus(line.debitAmount)
          : line.debitAmount.minus(line.creditAmount);
      bucket.yearToDate = bucket.yearToDate.plus(amount);
      if (line.journalEntry.entryDate >= fromDate) bucket.period = bucket.period.plus(amount);
      buckets.set(line.accountId, bucket);
    }
    const groups = [AccountType.REVENUE, AccountType.EXPENSE].map((type) => {
      const accounts = [...buckets.values()]
        .filter((bucket) => bucket.account.type === type)
        .sort((left, right) =>
          left.account.accountNumber.localeCompare(right.account.accountNumber)
        );
      const periodTotal = accounts.reduce(
        (total, account) => total.plus(account.period),
        new Prisma.Decimal(0)
      );
      const yearToDateTotal = accounts.reduce(
        (total, account) => total.plus(account.yearToDate),
        new Prisma.Decimal(0)
      );
      return {
        key: type,
        label: type === AccountType.REVENUE ? "Intäkter" : "Kostnader",
        accounts: accounts.map((account) => ({
          number: account.account.accountNumber,
          name: account.account.name,
          periodAmount: account.period.toFixed(2),
          yearToDateAmount: account.yearToDate.toFixed(2)
        })),
        periodTotal: periodTotal.toFixed(2),
        yearToDateTotal: yearToDateTotal.toFixed(2)
      };
    });
    const revenue = groups[0]!;
    const expenses = groups[1]!;
    return {
      fiscalYear: { id: fiscalYear.id, name: fiscalYear.name },
      fromDate: query.fromDate,
      toDate: query.toDate,
      groups,
      totals: {
        periodResult: new Prisma.Decimal(revenue.periodTotal)
          .minus(expenses.periodTotal)
          .toFixed(2),
        yearToDateResult: new Prisma.Decimal(revenue.yearToDateTotal)
          .minus(expenses.yearToDateTotal)
          .toFixed(2)
      }
    };
  }

  async balanceSheet(organizationId: string, query: BalanceSheetQueryDto) {
    const reportDate = this.asUtcDate(query.reportDate);
    const comparisonDate = query.comparisonDate ? this.asUtcDate(query.comparisonDate) : undefined;
    if (comparisonDate && comparisonDate > reportDate) {
      throw new BadRequestException("comparisonDate must be on or before reportDate.");
    }
    const fiscalYear = await this.database.prisma.fiscalYear.findFirst({
      select: { endDate: true, id: true, name: true, startDate: true },
      where: { id: query.fiscalYear, organizationId }
    });
    if (!fiscalYear) throw new NotFoundException("Fiscal year not found.");
    for (const date of [reportDate, comparisonDate]) {
      if (date && (date < fiscalYear.startDate || date > fiscalYear.endDate)) {
        throw new BadRequestException("Report dates must be within the selected fiscal year.");
      }
    }

    const [accounts, openingBalances, lines] = await Promise.all([
      this.database.prisma.account.findMany({
        orderBy: { accountNumber: "asc" },
        select: { accountNumber: true, id: true, name: true, type: true },
        where: {
          organizationId,
          type: { in: [AccountType.ASSET, AccountType.EQUITY, AccountType.LIABILITY] }
        }
      }),
      this.database.prisma.openingBalance.findMany({
        select: { accountId: true, creditAmount: true, debitAmount: true },
        where: { organizationId, fiscalYearId: fiscalYear.id }
      }),
      this.database.prisma.journalLine.findMany({
        include: {
          account: { select: { type: true } },
          journalEntry: { select: { entryDate: true } }
        },
        where: {
          organizationId,
          journalEntry: {
            organizationId,
            fiscalYearId: fiscalYear.id,
            status: JournalEntryStatus.POSTED,
            entryDate: { lte: reportDate }
          }
        }
      })
    ]);

    type Amounts = { comparison: Prisma.Decimal; current: Prisma.Decimal };
    const movements = new Map<string, Amounts>();
    const add = (accountId: string, current: Prisma.Decimal, comparison = current) => {
      const present = movements.get(accountId) ?? {
        current: new Prisma.Decimal(0),
        comparison: new Prisma.Decimal(0)
      };
      present.current = present.current.plus(current);
      present.comparison = present.comparison.plus(comparison);
      movements.set(accountId, present);
    };
    for (const opening of openingBalances)
      add(opening.accountId, opening.debitAmount.minus(opening.creditAmount));
    let currentResult = new Prisma.Decimal(0);
    let comparisonResult = new Prisma.Decimal(0);
    for (const line of lines) {
      const signed = line.debitAmount.minus(line.creditAmount);
      const comparisonSigned =
        comparisonDate && line.journalEntry.entryDate <= comparisonDate
          ? signed
          : new Prisma.Decimal(0);
      if (
        line.account.type === AccountType.ASSET ||
        line.account.type === AccountType.EQUITY ||
        line.account.type === AccountType.LIABILITY
      ) {
        add(line.accountId, signed, comparisonSigned);
      } else if (line.account.type === AccountType.REVENUE) {
        currentResult = currentResult.plus(line.creditAmount.minus(line.debitAmount));
        if (comparisonDate && line.journalEntry.entryDate <= comparisonDate)
          comparisonResult = comparisonResult.plus(line.creditAmount.minus(line.debitAmount));
      } else if (line.account.type === AccountType.EXPENSE) {
        currentResult = currentResult.minus(line.debitAmount.minus(line.creditAmount));
        if (comparisonDate && line.journalEntry.entryDate <= comparisonDate)
          comparisonResult = comparisonResult.minus(line.debitAmount.minus(line.creditAmount));
      }
    }
    const groupDefinitions = [
      [AccountType.ASSET, "Tillgångar"],
      [AccountType.EQUITY, "Eget kapital"],
      [AccountType.LIABILITY, "Skulder"]
    ] as const;
    const groups = groupDefinitions.map(([type, label]) => {
      const mappedAccounts = accounts
        .filter((account) => account.type === type)
        .map((account) => {
          const signed = movements.get(account.id) ?? {
            current: new Prisma.Decimal(0),
            comparison: new Prisma.Decimal(0)
          };
          const multiplier = type === AccountType.ASSET ? 1 : -1;
          return {
            number: account.accountNumber,
            name: account.name,
            amount: signed.current.mul(multiplier).toFixed(2),
            comparisonAmount: signed.comparison.mul(multiplier).toFixed(2)
          };
        });
      if (type === AccountType.EQUITY)
        mappedAccounts.push({
          number: "ÅRETS_RESULTAT",
          name: "Årets resultat",
          amount: currentResult.toFixed(2),
          comparisonAmount: comparisonResult.toFixed(2)
        });
      const total = mappedAccounts.reduce(
        (sum, account) => sum.plus(account.amount),
        new Prisma.Decimal(0)
      );
      const comparisonTotal = mappedAccounts.reduce(
        (sum, account) => sum.plus(account.comparisonAmount),
        new Prisma.Decimal(0)
      );
      return {
        key: type,
        label,
        accounts: mappedAccounts,
        total: total.toFixed(2),
        comparisonTotal: comparisonTotal.toFixed(2)
      };
    });
    const assets = new Prisma.Decimal(groups[0]!.total);
    const equityAndLiabilities = new Prisma.Decimal(groups[1]!.total).plus(groups[2]!.total);
    const comparisonAssets = new Prisma.Decimal(groups[0]!.comparisonTotal);
    const comparisonEquityAndLiabilities = new Prisma.Decimal(groups[1]!.comparisonTotal).plus(
      groups[2]!.comparisonTotal
    );
    return {
      fiscalYear: { id: fiscalYear.id, name: fiscalYear.name },
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
  }

  async vat(organizationId: string, query: VatReportQueryDto) {
    const fromDate = this.asUtcDate(query.fromDate);
    const toDate = this.asUtcDate(query.toDate);
    if (fromDate > toDate) throw new BadRequestException("fromDate must be on or before toDate.");
    const fiscalYear = await this.database.prisma.fiscalYear.findFirst({
      select: { endDate: true, id: true, name: true, startDate: true },
      where: { id: query.fiscalYear, organizationId }
    });
    if (!fiscalYear) throw new NotFoundException("Fiscal year not found.");
    if (fromDate < fiscalYear.startDate || toDate > fiscalYear.endDate) {
      throw new BadRequestException("The report interval must be within the selected fiscal year.");
    }
    const lines = await this.database.prisma.journalLine.findMany({
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
    const report = calculateVatReport(
      lines.map((line): VatReportLine => ({
        account: line.account,
        accountId: line.accountId,
        creditAmount: line.creditAmount,
        debitAmount: line.debitAmount,
        entryDate: line.journalEntry.entryDate,
        journalEntryId: line.journalEntryId,
        vatCode: line.vatCode,
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
      ...report
    };
  }

  private asUtcDate(value: string) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException("Dates must be valid calendar dates in YYYY-MM-DD format.");
    }
    return parsed;
  }
}

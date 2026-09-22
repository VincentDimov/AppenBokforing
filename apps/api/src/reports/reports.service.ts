import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountType, JournalEntryStatus, Prisma } from "@ledgerapp/db";

import { DatabaseService } from "../database/database.service";
import { GeneralLedgerQueryDto } from "./dto/general-ledger-query.dto";
import { IncomeStatementQueryDto } from "./dto/income-statement-query.dto";

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

  private asUtcDate(value: string) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException("Dates must be valid calendar dates in YYYY-MM-DD format.");
    }
    return parsed;
  }
}

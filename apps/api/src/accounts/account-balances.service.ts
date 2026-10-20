import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { JournalEntryStatus, Prisma } from "@ledgerapp/db";
import { DatabaseService } from "../database/database.service";
import { emptyMovement, rollForward, zeroBalance } from "../accounting/accounting-balances";
import { readAccountingContext, requireReportInterval } from "../reports/accounting-report-data";
import { AccountBalancesQueryDto } from "./dto/account-balances-query.dto";

@Injectable()
export class AccountBalancesService {
  constructor(private readonly database: DatabaseService) {}

  async read(organizationId: string, query: AccountBalancesQueryDto) {
    const date = new Date(`${query.date}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== query.date)
      throw new BadRequestException("A valid calendar date is required.");

    return this.database.prisma.$transaction(
      async (tx) => {
        // Validate the whole year's IB, not just the selected accounts.
        const context = await readAccountingContext(tx, organizationId, query.fiscalYearId);
        requireReportInterval(context.fiscalYear, context.fiscalYear.startDate, date);
        const requested = new Set(query.accountIds);
        const accounts = context.accounts.filter((account) => requested.has(account.id));
        if (accounts.length !== requested.size) throw new NotFoundException("Account not found.");
        const movements = await tx.journalLine.groupBy({
          by: ["accountId"],
          _sum: { debitAmount: true, creditAmount: true },
          where: {
            organizationId,
            accountId: { in: query.accountIds },
            journalEntry: {
              organizationId,
              fiscalYearId: context.fiscalYear.id,
              status: JournalEntryStatus.POSTED,
              entryDate: { gte: context.fiscalYear.startDate, lte: date }
            }
          }
        });
        const byAccount = new Map(
          movements.map((row) => [
            row.accountId,
            {
              debit: row._sum.debitAmount ?? zeroBalance(),
              credit: row._sum.creditAmount ?? zeroBalance()
            }
          ])
        );
        return {
          organizationId,
          fiscalYearId: context.fiscalYear.id,
          date: query.date,
          accounts: accounts.map((account) => ({
            accountId: account.id,
            balance: rollForward(
              context.opening.get(account.id) ?? zeroBalance(),
              byAccount.get(account.id) ?? emptyMovement()
            ).toFixed(2)
          }))
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }
}

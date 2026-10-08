import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException
} from "@nestjs/common";
import { AccountType, JournalEntryStatus, Prisma } from "@ledgerapp/db";
import { rawBalance, zeroBalance } from "../accounting/accounting-balances";

export function accountingDataError(code: string, message: string): never {
  throw new UnprocessableEntityException({ code, message });
}

/** Full-year IB is validated BEFORE selecting accounts or producing a partial report. */
export async function readAccountingContext(
  tx: Prisma.TransactionClient,
  organizationId: string,
  fiscalYearId: string
) {
  const fiscalYear = await tx.fiscalYear.findFirst({
    where: { organizationId, id: fiscalYearId },
    select: { id: true, name: true, startDate: true, endDate: true }
  });
  if (!fiscalYear) throw new NotFoundException("Fiscal year not found.");
  const accounts = await tx.account.findMany({
    take: 10001,
    where: { organizationId },
    orderBy: { accountNumber: "asc" },
    select: {
      id: true,
      organizationId: true,
      accountNumber: true,
      name: true,
      type: true,
      normalBalance: true
    }
  });
  const openingBalances = await tx.openingBalance.findMany({
    take: 10001,
    where: { organizationId, fiscalYearId },
    select: {
      accountId: true,
      organizationId: true,
      fiscalYearId: true,
      debitAmount: true,
      creditAmount: true
    }
  });
  if (accounts.length > 10000 || openingBalances.length > 10000)
    accountingDataError("REPORT_TOO_LARGE", "Maximum 10,000 accounts/opening balances per report.");
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const opening = new Map<string, Prisma.Decimal>();
  let debit = zeroBalance(),
    credit = zeroBalance();
  for (const row of openingBalances) {
    const account = accountMap.get(row.accountId);
    if (
      !account ||
      row.organizationId !== organizationId ||
      row.fiscalYearId !== fiscalYearId ||
      account.organizationId !== organizationId
    )
      accountingDataError(
        "INVALID_OPENING_BALANCE",
        "Opening balance contains an invalid account or fiscal-year reference."
      );
    if (account.type === AccountType.REVENUE || account.type === AccountType.EXPENSE)
      accountingDataError(
        "INVALID_OPENING_BALANCE",
        "Opening balances must use balance-sheet accounts, not income-statement accounts."
      );
    const d = row.debitAmount,
      c = row.creditAmount;
    if (
      !d.isFinite() ||
      !c.isFinite() ||
      d.isNegative() ||
      c.isNegative() ||
      (d.greaterThan("0") && c.greaterThan("0")) ||
      d.decimalPlaces() > 2 ||
      c.decimalPlaces() > 2 ||
      opening.has(row.accountId)
    )
      accountingDataError(
        "INVALID_OPENING_BALANCE",
        "Opening balance amounts must be non-negative, single-sided and exact to two decimals."
      );
    debit = debit.plus(d);
    credit = credit.plus(c);
    opening.set(row.accountId, rawBalance(d, c));
  }
  if (!debit.equals(credit))
    accountingDataError(
      "UNBALANCED_OPENING_BALANCE",
      "Fiscal-year opening debit and credit totals do not balance."
    );
  return {
    fiscalYear,
    accounts,
    opening,
    openingTotals: { debit: debit.toFixed(2), credit: credit.toFixed(2) }
  };
}

export function requireReportInterval(
  year: { startDate: Date; endDate: Date },
  from: Date,
  to: Date
) {
  if (from > to || from < year.startDate || to > year.endDate)
    throw new BadRequestException(
      "The report interval must be ordered and within the selected fiscal year."
    );
}

/** One grouped DB query per interval, never one query per account. */
export async function readPostedMovements(
  tx: Prisma.TransactionClient,
  organizationId: string,
  fiscalYearId: string,
  from: Date,
  to: Date,
  dimensions: { project?: string; costCenter?: string } = {}
) {
  const rows = await tx.journalLine.groupBy({
    by: ["accountId"],
    _sum: { debitAmount: true, creditAmount: true },
    where: {
      organizationId,
      ...(dimensions.project ? { project: { organizationId, code: dimensions.project } } : {}),
      ...(dimensions.costCenter
        ? { costCenter: { organizationId, code: dimensions.costCenter } }
        : {}),
      journalEntry: {
        organizationId,
        fiscalYearId,
        status: JournalEntryStatus.POSTED,
        entryDate: { gte: from, lte: to }
      }
    }
  });
  return new Map(
    rows.map((row) => [
      row.accountId,
      {
        debit: row._sum.debitAmount ?? zeroBalance(),
        credit: row._sum.creditAmount ?? zeroBalance()
      }
    ])
  );
}

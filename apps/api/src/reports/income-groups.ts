import { AccountType, Prisma } from "@ledgerapp/db";
import {
  presentationBalance,
  rawBalance,
  zeroBalance,
  emptyMovement
} from "../accounting/accounting-balances";
type Account = { id: string; accountNumber: string; name: string; type: AccountType };
type Movements = Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>;
/** Single income presentation/classification engine for statements and charts. */
export function incomeGroups(accounts: Account[], period: Movements, accumulated: Movements) {
  return [AccountType.REVENUE, AccountType.EXPENSE].map((type) => {
    const rows = accounts
      .filter(
        (account) =>
          account.type === type && (period.has(account.id) || accumulated.has(account.id))
      )
      .map((account) => {
        const p = period.get(account.id) ?? emptyMovement(),
          y = accumulated.get(account.id) ?? emptyMovement();
        return {
          number: account.accountNumber,
          name: account.name,
          periodAmount: presentationBalance(rawBalance(p.debit, p.credit), type).toFixed(2),
          yearToDateAmount: presentationBalance(rawBalance(y.debit, y.credit), type).toFixed(2)
        };
      })
      .sort((a, b) => a.number.localeCompare(b.number));
    return {
      key: type,
      label: type === AccountType.REVENUE ? "Intäkter" : "Kostnader",
      accounts: rows,
      periodTotal: rows.reduce((sum, row) => sum.plus(row.periodAmount), zeroBalance()).toFixed(2),
      yearToDateTotal: rows
        .reduce((sum, row) => sum.plus(row.yearToDateAmount), zeroBalance())
        .toFixed(2)
    };
  });
}

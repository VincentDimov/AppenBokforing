import { AccountType, BalanceSide } from "@ledgerapp/db";

/** Derives the only valid normal balance from an account's classification. */
export function normalBalanceForAccountType(accountType: AccountType): BalanceSide {
  switch (accountType) {
    case AccountType.ASSET:
    case AccountType.EXPENSE:
      return BalanceSide.DEBIT;
    case AccountType.LIABILITY:
    case AccountType.EQUITY:
    case AccountType.REVENUE:
      return BalanceSide.CREDIT;
  }
}

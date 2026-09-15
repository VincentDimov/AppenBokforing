import { AccountType, BalanceSide } from "@ledgerapp/db";

import { normalBalanceForAccountType } from "./account-normal-balance";

describe("normalBalanceForAccountType", () => {
  it.each([
    [AccountType.ASSET, BalanceSide.DEBIT],
    [AccountType.EXPENSE, BalanceSide.DEBIT],
    [AccountType.LIABILITY, BalanceSide.CREDIT],
    [AccountType.EQUITY, BalanceSide.CREDIT],
    [AccountType.REVENUE, BalanceSide.CREDIT]
  ])("derives %s as %s", (accountType, expectedBalance) => {
    expect(normalBalanceForAccountType(accountType)).toBe(expectedBalance);
  });
});

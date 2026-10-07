import { AccountType, BalanceSide, Prisma } from "@ledgerapp/db";
import { normalBalanceForAccountType } from "../accounts/account-normal-balance";

// All amounts stay Decimal, including totals exceeding a single NUMERIC(18,2) row.
// Local clone: aggregate cents stay exact without changing posting/SIE/VAT settings.
const ReportingDecimal = Prisma.Decimal.clone({ precision: 40 });
export const zeroBalance = () => new ReportingDecimal("0");
export const rawBalance = (debit: Prisma.Decimal, credit: Prisma.Decimal) =>
  new ReportingDecimal(debit).minus(credit);
export function balanceSides(net: Prisma.Decimal) {
  return {
    debit: net.isPositive() ? net : zeroBalance(),
    credit: net.isNegative() ? net.negated() : zeroBalance()
  };
}
export function presentationBalance(net: Prisma.Decimal, type: AccountType) {
  return normalBalanceForAccountType(type) === BalanceSide.DEBIT ? net : net.negated();
}
export type AccountMovement = { debit: Prisma.Decimal; credit: Prisma.Decimal };
export const emptyMovement = (): AccountMovement => ({
  debit: zeroBalance(),
  credit: zeroBalance()
});
export function rollForward(opening: Prisma.Decimal, movement: AccountMovement) {
  return new ReportingDecimal(opening).plus(rawBalance(movement.debit, movement.credit));
}

import { AccountType, Prisma } from "@ledgerapp/db";
import { balanceSides, presentationBalance, rawBalance, rollForward } from "./accounting-balances";

const d = (value: string) => new Prisma.Decimal(value);
describe("accounting sign contract", () => {
  it("preserves exact cents and large aggregates, without Number conversion", () => {
    expect(
      rollForward(d("9999999999999999.99"), { debit: d("0.01"), credit: d("0") }).toFixed(2)
    ).toBe("10000000000000000.00");
    expect(rawBalance(d("0.30"), d("0.10")).toFixed(2)).toBe("0.20");
    expect(rawBalance(d("99999999999999999999.99"), d("0.01")).toFixed(2)).toBe(
      "99999999999999999999.98"
    );
  });
  it.each([
    ["0.00", "0.00", "0.00"],
    ["12.34", "12.34", "0.00"],
    ["-12.34", "0.00", "12.34"]
  ])("splits raw %s into real debit/credit sides", (net, debit, credit) => {
    const sides = balanceSides(d(net));
    expect(sides.debit.toFixed(2)).toBe(debit);
    expect(sides.credit.toFixed(2)).toBe(credit);
  });
  it("does not erase abnormal account balances with absolute values", () => {
    expect(presentationBalance(d("-50"), AccountType.ASSET).toFixed(2)).toBe("-50.00");
    expect(presentationBalance(d("50"), AccountType.LIABILITY).toFixed(2)).toBe("-50.00");
    expect(presentationBalance(d("-50"), AccountType.REVENUE).toFixed(2)).toBe("50.00");
  });
});

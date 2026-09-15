import { describe, expect, it } from "@jest/globals";

import {
  calculateVoucherAmounts,
  formatOre,
  isValidJournalAmountLine,
  parseMoneyToOre
} from "@/lib/vouchers";

describe("voucher amount helpers", () => {
  it("uses integer öre for exact balancing instead of floating point", () => {
    const totals = calculateVoucherAmounts([
      { credit: "0,00", debit: "0,10" },
      { credit: "0.20", debit: "0,00" },
      { credit: "0.00", debit: "0,10" }
    ]);

    expect(totals).toEqual({ credit: 20n, debit: 20n, difference: 0n });
    expect(formatOre(totals!.difference)).toBe("0,00");
  });

  it("rejects negative, malformed, zero-sided and double-sided row values", () => {
    expect(parseMoneyToOre("-1,00")).toBeNull();
    expect(parseMoneyToOre("1,234")).toBeNull();
    expect(isValidJournalAmountLine({ credit: "0,00", debit: "0,00" })).toBe(false);
    expect(isValidJournalAmountLine({ credit: "10,00", debit: "10,00" })).toBe(false);
    expect(isValidJournalAmountLine({ credit: "10,00", debit: "0,00" })).toBe(true);
  });
});

import { Prisma, VatCodeType } from "@ledgerapp/db";

import { calculateVatReport, type VatReportLine } from "./vat-reporting-engine";

const decimal = (value: string) => new Prisma.Decimal(value);
const outputCode = {
  code: "MOMS25_UT",
  id: "vat-output",
  name: "Utgående moms 25 %",
  rate: decimal("25"),
  type: VatCodeType.OUTPUT
};

function line(overrides: Partial<VatReportLine> = {}): VatReportLine {
  return {
    account: { accountNumber: "2611", name: "Utgående moms", vatCodeId: "vat-output" },
    accountId: "account-1",
    creditAmount: decimal("25"),
    debitAmount: decimal("0"),
    entryDate: new Date("2026-01-15T00:00:00.000Z"),
    journalEntryId: "entry-1",
    vatCode: outputCode,
    vatCodeId: "vat-output",
    voucherLabel: "A1",
    ...overrides
  };
}

describe("VAT reporting engine", () => {
  it("calculates configured input/output code amounts without country-specific rules", () => {
    const report = calculateVatReport([
      line(),
      line({
        account: { accountNumber: "1930", name: "Bank", vatCodeId: null },
        accountId: "bank-1",
        creditAmount: decimal("0"),
        debitAmount: decimal("25"),
        vatCode: null,
        vatCodeId: null
      }),
      line({
        account: { accountNumber: "2641", name: "Ingående moms", vatCodeId: "vat-input" },
        accountId: "account-2",
        creditAmount: decimal("0"),
        debitAmount: decimal("10"),
        journalEntryId: "entry-2",
        vatCode: { ...outputCode, code: "MOMS25_IN", id: "vat-input", type: VatCodeType.INPUT },
        vatCodeId: "vat-input"
      }),
      line({
        account: { accountNumber: "1930", name: "Bank", vatCodeId: null },
        accountId: "bank-2",
        creditAmount: decimal("10"),
        debitAmount: decimal("0"),
        journalEntryId: "entry-2",
        vatCode: null,
        vatCodeId: null
      })
    ]);
    expect(report.totals).toEqual({ inputVat: "10.00", outputVat: "25.00", vatPosition: "15.00" });
    expect(report.anomalies).toEqual([]);
  });

  it("reports missing codes, conflicts, unexpected signs and unbalanced entries", () => {
    const report = calculateVatReport([
      line({ vatCode: null, vatCodeId: null, creditAmount: decimal("25") }),
      line({
        accountId: "account-2",
        debitAmount: decimal("20"),
        creditAmount: decimal("0"),
        vatCodeId: "different-code"
      })
    ]);
    expect(report.anomalies.map((anomaly) => anomaly.code)).toEqual(
      expect.arrayContaining([
        "MISSING_VAT_CODE",
        "VAT_CODE_ACCOUNT_CONFLICT",
        "UNEXPECTED_VAT_AMOUNT",
        "UNBALANCED_ENTRY"
      ])
    );
  });
});

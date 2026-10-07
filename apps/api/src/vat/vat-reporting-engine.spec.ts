import { Prisma, VatLineRole } from "@ledgerapp/db";
import { vatGolden } from "../../../../tests/fixtures/vat-golden";
import { calculateVatReport, type VatReportLine } from "./vat-reporting-engine";
import { mapSwedishVatReport } from "./swedish-vat-configuration";

function goldenLines(): VatReportLine[] {
  return vatGolden.cases.flatMap((c) =>
    c.lines.map((l) => {
      const code = vatGolden.codes.find((v) => v.code === l.code);
      return {
        account: { accountNumber: l.account, name: l.account, vatCodeId: null },
        accountId: l.account,
        debitAmount: new Prisma.Decimal(l.debit),
        creditAmount: new Prisma.Decimal(l.credit),
        entryDate: new Date("2026-01-15"),
        journalEntryId: c.name,
        voucherLabel: c.name,
        vatCodeId: code?.code ?? null,
        vatRole: l.role ?? VatLineRole.NONE,
        vatGroup: l.group ?? null,
        vatSnapshot: code
          ? {
              id: code.code,
              code: code.code,
              name: code.code,
              rate: code.rate,
              direction: code.type === "EXEMPT" ? "NONE" : code.type,
              configurationVersion: "SE-DOMESTIC-2026-01",
              reportingCategory: code.type === "EXEMPT" ? "NONE" : "DOMESTIC_STANDARD",
              effectiveFrom: "2026-01-01",
              effectiveTo: "2026-12-31",
              expectedAccountVatCodeId: null
            }
          : { expectedAccountVatCodeId: null }
      };
    })
  );
}
describe("Explicit VAT arithmetic / manual Golden cases", () => {
  it("supports zero rate arithmetic without inventing a Swedish box", () => {
    const lines = goldenLines()
      .filter((l) => l.journalEntryId === "G")
      .map((l) => ({
        ...l,
        vatSnapshot: l.vatCodeId
          ? { ...(l.vatSnapshot as object), direction: "INPUT" }
          : l.vatSnapshot
      }));
    const report = calculateVatReport(lines);
    expect(report.totals.inputBase).toBe("1000.00");
    expect(report.totals.inputVat).toBe("0.00");
    expect(report.anomalies).toEqual([]);
    expect(mapSwedishVatReport(report).warnings).not.toEqual([]);
  });
  it("recognizes input VAT credits by matching negative base and tax", () => {
    const lines = goldenLines()
      .filter((l) => l.journalEntryId === "D")
      .map((l) => ({ ...l, debitAmount: l.creditAmount, creditAmount: l.debitAmount }));
    const report = calculateVatReport(lines);
    expect(report.totals.inputBase).toBe("-1000.00");
    expect(report.totals.inputVat).toBe("-250.00");
    expect(report.anomalies).toEqual([]);
  });
  it("withholds mappings outside the reviewed version's date range", () => {
    const report = mapSwedishVatReport(
      calculateVatReport(goldenLines()),
      "2027-01-01",
      "2027-01-31"
    );
    expect(report.complete).toBe(false);
    expect(report.boxes.every((b) => b.amount === "0.00")).toBe(true);
  });
  it.each(vatGolden.cases)(
    "case $name keeps base separate from tax and accepts valid credits",
    (c) => {
      const report = calculateVatReport(goldenLines().filter((l) => l.journalEntryId === c.name));
      expect(report.totals.inputVat).toBe(c.input);
      expect(report.totals.outputVat).toBe(c.output);
      expect(
        report.codes
          .reduce((sum, code) => sum.plus(code.taxableBase), new Prisma.Decimal(0))
          .toFixed(2)
      ).toBe(c.base);
      expect(report.anomalies).toEqual([]);
    }
  );
  it("reconciles fixed combined totals and Swedish boxes", () => {
    const report = calculateVatReport(goldenLines());
    expect(report.totals).toEqual(vatGolden.totals);
    expect(
      Object.fromEntries(mapSwedishVatReport(report).boxes.map((b) => [b.box, b.amount]))
    ).toEqual(vatGolden.boxes);
  });
  it.each([
    ["ORPHAN_TAX", (l: VatReportLine[]) => l.filter((x) => x.vatRole !== "BASE")],
    ["MISSING_TAX_LINE", (l: VatReportLine[]) => l.filter((x) => x.vatRole !== "TAX")],
    [
      "UNCLASSIFIED_VAT_LINE",
      (l: VatReportLine[]) => l.map((x) => ({ ...x, vatRole: VatLineRole.UNCLASSIFIED }))
    ],
    ["MISSING_VAT_SNAPSHOT", (l: VatReportLine[]) => l.map((x) => ({ ...x, vatSnapshot: null }))],
    ["MISSING_VAT_CODE", (l: VatReportLine[]) => l.map((x) => ({ ...x, vatCodeId: null }))],
    [
      "VAT_CODE_ACCOUNT_CONFLICT",
      (l: VatReportLine[]) =>
        l.map((x) => ({
          ...x,
          vatSnapshot: x.vatCodeId
            ? { ...(x.vatSnapshot as object), expectedAccountVatCodeId: "different" }
            : x.vatSnapshot
        }))
    ],
    [
      "INVALID_RATE",
      (l: VatReportLine[]) =>
        l.map((x) => ({
          ...x,
          vatSnapshot: x.vatCodeId ? { ...(x.vatSnapshot as object), rate: "NaN" } : x.vatSnapshot
        }))
    ],
    [
      "UNEXPECTED_VAT_SIDE",
      (l: VatReportLine[]) =>
        l.map((x) =>
          x.vatRole === "TAX"
            ? { ...x, debitAmount: x.creditAmount, creditAmount: new Prisma.Decimal(0) }
            : x
        )
    ],
    [
      "RATE_BASE_MISMATCH",
      (l: VatReportLine[]) =>
        l.map((x) => (x.vatRole === "TAX" ? { ...x, creditAmount: new Prisma.Decimal(200) } : x))
    ],
    ["UNBALANCED_ENTRY", (l: VatReportLine[]) => l.slice(0, 2)]
  ] as const)("surfaces %s without changing books", (code, mutate) => {
    expect(
      calculateVatReport(
        mutate(goldenLines().filter((l) => l.journalEntryId === "A"))
      ).anomalies.map((a) => a.code)
    ).toContain(code);
  });
  it("rejects mixing codes in the same explicit group", () => {
    const lines = goldenLines()
      .filter((l) => l.journalEntryId === "F")
      .map((l) => ({ ...l, vatGroup: "one" }));
    expect(calculateVatReport(lines).anomalies.map((a) => a.code)).toContain("MIXED_VAT_CODES");
  });
  it("does not silently map unreviewed versions or zero-rated supplies to domestic boxes", () => {
    const lines = goldenLines()
      .filter((l) => l.journalEntryId === "A")
      .map((l) => ({
        ...l,
        vatSnapshot: l.vatCodeId
          ? { ...(l.vatSnapshot as object), configurationVersion: "future" }
          : l.vatSnapshot
      }));
    expect(mapSwedishVatReport(calculateVatReport(lines)).warnings).toHaveLength(1);
  });
});

import { decimalCell, encodeCsv, reportCsv, textCell } from "./report-csv";

it.each([
  {
    kind: "general-ledger",
    data: {
      accounts: [
        {
          account: { number: "1930", name: "Bank" },
          openingBalance: "12000.00",
          closingBalance: "11000.00",
          transactions: [
            {
              date: "2026-06-01",
              voucher: "A4",
              description: "Rättelse",
              debit: "0.00",
              credit: "1000.00",
              runningBalance: "11000.00"
            }
          ]
        }
      ]
    },
    expected: '"1930";"Bank";"2026-06-01";"A4";"Rättelse";"0.00";"1000.00";"11000.00"'
  },
  {
    kind: "income-statement",
    data: {
      groups: [
        {
          label: "Intäkter",
          periodTotal: "-500.00",
          yearToDateTotal: "4500.00",
          accounts: [
            { number: "3000", name: "Intäkt", periodAmount: "-500.00", yearToDateAmount: "4500.00" }
          ]
        }
      ]
    },
    expected: '"Intäkter";"3000";"Intäkt";"-500.00";"4500.00"'
  },
  {
    kind: "balance-sheet",
    data: {
      groups: [
        {
          label: "Tillgångar",
          total: "11000.00",
          comparisonTotal: "12000.00",
          accounts: [
            { number: "1930", name: "Bank", amount: "11000.00", comparisonAmount: "12000.00" }
          ]
        }
      ]
    },
    expected: '"Tillgångar";"1930";"Bank";"11000.00";"12000.00"'
  },
  {
    kind: "vat",
    data: {
      codes: [
        {
          code: "VAT25",
          name: "Utgående",
          type: "OUTPUT",
          rate: "25.00",
          taxableBase: "1960.00",
          inputAmount: "0.00",
          outputAmount: "490.00"
        }
      ],
      swedishReturn: {
        configurationVersion: "SE-test",
        boxes: [{ box: "49", name: "Netto", amount: "240.00" }],
        warnings: ["Granska avdragsrätt"]
      },
      anomalies: [{ code: "CONFLICT", account: "3000", voucher: "A1", message: "Granska kod" }]
    },
    expected: '"VAT25";"Utgående";"OUTPUT";"25.00";"1960.00";"0.00";"490.00"'
  }
])(
  "exports $kind using the real response column contract and loaded dimension filters",
  ({ kind, data, expected }) => {
    const csv = reportCsv(
      { fiscalYear: { name: "2026" }, ...data },
      `/api/reports/${kind}?fiscalYear=year&project=P1&costCenter=K1`,
      { name: "Årsbolag" }
    );
    expect(csv).toContain(expected);
    expect(csv).toContain('"project";"P1"');
    expect(csv).toContain('"costCenter";"K1"');
    if (kind === "vat") {
      expect(csv).toContain('"49";"Netto";"240.00"');
      expect(csv).toContain('"VARNING";"Granska avdragsrätt"');
      expect(csv).toContain('"CONFLICT";"3000";"A1";"Granska kod"');
    }
  }
);

it("fails clearly at the CSV row limit rather than silently truncating accounting data", () => {
  expect(() => encodeCsv(Array.from({ length: 30001 }, () => [textCell("rad")]))).toThrow(
    /exportgränsen/
  );
});
it("quotes Swedish text, dangerous formulas and leading whitespace without corrupting exact negative Decimal values", () => {
  expect(
    encodeCsv([
      [
        textCell('Åäö; "rad"\ntext'),
        textCell("=HYPERLINK(1)"),
        textCell("  -1+2"),
        textCell("@cmd"),
        textCell("+cmd"),
        decimalCell("-9007199254740993.01")
      ]
    ])
  ).toBe(
    '\ufeff"Åäö; ""rad""\ntext";"\'=HYPERLINK(1)";"\'  -1+2";"\'@cmd";"\'+cmd";"-9007199254740993.01"\r\n'
  );
  expect(() => encodeCsv([[decimalCell("=1")]])).toThrow();
});
it("exports deterministic Golden totals and loaded filters, not unsaved UI input", () => {
  const csv = reportCsv(
    {
      fiscalYear: { name: "2026" },
      accounts: [
        {
          number: "1930",
          name: "Bank",
          openingDebit: "12000.00",
          openingCredit: "0.00",
          periodDebit: "100.01",
          periodCredit: "0.00",
          closingDebit: "12100.01",
          closingCredit: "0.00"
        }
      ],
      totals: { closingDebit: "13500.00", closingCredit: "13500.00" }
    },
    "/api/reports/trial-balance?organizationId=org&fiscalYear=year&fromDate=2026-01-01&toDate=2026-12-31",
    { name: "Årsbolag" }
  );
  expect(csv).toContain('"13500.00"');
  expect(csv).toContain('"fromDate";"2026-01-01"');
  expect(csv).toContain('"Organisation";"Årsbolag"');
});

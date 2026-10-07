// Manually specified amounts/facit. No production calculation helpers here.
export type GoldenVatLine = {
  account: string;
  debit: string;
  credit: string;
  code?: string;
  role?: "BASE" | "TAX";
  group?: string;
};
const sale = (code: string, tax: string, gross: string): GoldenVatLine[] => [
  { account: "3001", debit: "0", credit: "1000", code, role: "BASE" },
  { account: "2611", debit: "0", credit: tax, code, role: "TAX" },
  { account: "1930", debit: gross, credit: "0" }
];
export const vatGolden = {
  year: { name: "VAT Golden 2026", startDate: "2026-01-01", endDate: "2026-12-31" },
  cases: [
    {
      name: "A",
      lines: sale("OUT25", "250", "1250"),
      base: "1000.00",
      input: "0.00",
      output: "250.00"
    },
    {
      name: "B",
      lines: sale("OUT12", "120", "1120"),
      base: "1000.00",
      input: "0.00",
      output: "120.00"
    },
    {
      name: "C",
      lines: sale("OUT6", "60", "1060"),
      base: "1000.00",
      input: "0.00",
      output: "60.00"
    },
    {
      name: "D",
      lines: [
        { account: "5000", debit: "1000", credit: "0", code: "IN25", role: "BASE" },
        { account: "2641", debit: "250", credit: "0", code: "IN25", role: "TAX" },
        { account: "1930", debit: "0", credit: "1250" }
      ] as GoldenVatLine[],
      base: "1000.00",
      input: "250.00",
      output: "0.00"
    },
    {
      name: "E",
      lines: [
        { account: "3001", debit: "1000", credit: "0", code: "OUT25", role: "BASE" },
        { account: "2611", debit: "250", credit: "0", code: "OUT25", role: "TAX" },
        { account: "1930", debit: "0", credit: "1250" }
      ] as GoldenVatLine[],
      base: "-1000.00",
      input: "0.00",
      output: "-250.00"
    },
    {
      name: "F",
      lines: [
        { account: "3001", debit: "0", credit: "1000", code: "OUT25", role: "BASE", group: "high" },
        { account: "2611", debit: "0", credit: "250", code: "OUT25", role: "TAX", group: "high" },
        { account: "3001", debit: "0", credit: "1000", code: "OUT6", role: "BASE", group: "low" },
        { account: "2611", debit: "0", credit: "60", code: "OUT6", role: "TAX", group: "low" },
        { account: "1930", debit: "2310", credit: "0" }
      ] as GoldenVatLine[],
      base: "2000.00",
      input: "0.00",
      output: "310.00"
    },
    {
      name: "G",
      lines: [
        { account: "5000", debit: "1000", credit: "0", code: "NONE", role: "BASE" },
        { account: "1930", debit: "0", credit: "1000" }
      ] as GoldenVatLine[],
      base: "1000.00",
      input: "0.00",
      output: "0.00"
    }
  ],
  codes: [
    { code: "OUT25", rate: "25.00", type: "OUTPUT" },
    { code: "OUT12", rate: "12.00", type: "OUTPUT" },
    { code: "OUT6", rate: "6.00", type: "OUTPUT" },
    { code: "IN25", rate: "25.00", type: "INPUT" },
    { code: "NONE", rate: "0.00", type: "EXEMPT" }
  ],
  totals: {
    outputBase: "4000.00",
    inputBase: "1000.00",
    nonVatBase: "1000.00",
    inputVat: "250.00",
    outputVat: "490.00",
    vatPosition: "240.00"
  },
  boxes: {
    "05": "4000.00",
    "10": "250.00",
    "11": "120.00",
    "12": "120.00",
    "48": "250.00",
    "49": "240.00"
  }
} as const;

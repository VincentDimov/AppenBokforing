/** Accounting values and facit are fixed; database UUIDs are only run-isolation identifiers. */
export const goldenAccounting = {
  year: { name: "Golden 2026", startDate: "2026-01-01", endDate: "2026-12-31" },
  accounts: [
    {
      number: "1510",
      name: "Kundfordringar",
      type: "ASSET",
      openingDebit: "2000.00",
      openingCredit: "0.00"
    },
    {
      number: "1930",
      name: "Bank",
      type: "ASSET",
      openingDebit: "10000.00",
      openingCredit: "0.00"
    },
    {
      number: "2080",
      name: "Eget kapital",
      type: "EQUITY",
      openingDebit: "0.00",
      openingCredit: "9000.00"
    },
    {
      number: "2440",
      name: "Leverantörsskulder",
      type: "LIABILITY",
      openingDebit: "0.00",
      openingCredit: "3000.00"
    },
    {
      number: "3010",
      name: "Försäljning",
      type: "REVENUE",
      openingDebit: "0.00",
      openingCredit: "0.00"
    },
    {
      number: "5000",
      name: "Kostnad",
      type: "EXPENSE",
      openingDebit: "0.00",
      openingCredit: "0.00"
    }
  ],
  vouchers: [
    { date: "2026-01-01", text: "Kundbetalning", debit: "1930", credit: "1510", amount: "2000.00" },
    {
      date: "2026-02-15",
      text: "Leverantörsfaktura",
      debit: "5000",
      credit: "2440",
      amount: "1500.00"
    },
    { date: "2026-03-01", text: "Försäljning", debit: "1930", credit: "3010", amount: "5000.00" },
    {
      date: "2026-04-01",
      text: "Betalning leverantör",
      debit: "2440",
      credit: "1930",
      amount: "3000.00"
    },
    { date: "2026-06-01", text: "Kreditnota", debit: "3010", credit: "1930", amount: "500.00" }
  ],
  reversal: { originalIndex: 1, date: "2026-07-01", description: "Rättelse leverantörsfaktura" },
  finalVoucher: {
    date: "2026-12-31",
    text: "Årsslutskostnad",
    debit: "5000",
    credit: "1930",
    amount: "2500.00"
  },
  draft: {
    date: "2026-05-01",
    text: "Ej bokfört",
    debit: "1930",
    credit: "3010",
    amount: "999999.00"
  },
  expected: {
    openingTotals: { debit: "12000.00", credit: "12000.00" },
    fullYearTotals: {
      openingDebit: "12000.00",
      openingCredit: "12000.00",
      periodDebit: "16000.00",
      periodCredit: "16000.00",
      closingDebit: "13500.00",
      closingCredit: "13500.00"
    },
    midYearTotals: {
      openingDebit: "15000.00",
      openingCredit: "15000.00",
      periodDebit: "4000.00",
      periodCredit: "4000.00",
      closingDebit: "13500.00",
      closingCredit: "13500.00"
    },
    accounts: [
      {
        number: "1510",
        openingDebit: "2000.00",
        openingCredit: "0.00",
        periodDebit: "0.00",
        periodCredit: "2000.00",
        closingDebit: "0.00",
        closingCredit: "0.00"
      },
      {
        number: "1930",
        openingDebit: "10000.00",
        openingCredit: "0.00",
        periodDebit: "7000.00",
        periodCredit: "6000.00",
        closingDebit: "11000.00",
        closingCredit: "0.00"
      },
      {
        number: "2080",
        openingDebit: "0.00",
        openingCredit: "9000.00",
        periodDebit: "0.00",
        periodCredit: "0.00",
        closingDebit: "0.00",
        closingCredit: "9000.00"
      },
      {
        number: "2440",
        openingDebit: "0.00",
        openingCredit: "3000.00",
        periodDebit: "4500.00",
        periodCredit: "1500.00",
        closingDebit: "0.00",
        closingCredit: "0.00"
      },
      {
        number: "3010",
        openingDebit: "0.00",
        openingCredit: "0.00",
        periodDebit: "500.00",
        periodCredit: "5000.00",
        closingDebit: "0.00",
        closingCredit: "4500.00"
      },
      {
        number: "5000",
        openingDebit: "0.00",
        openingCredit: "0.00",
        periodDebit: "4000.00",
        periodCredit: "1500.00",
        closingDebit: "2500.00",
        closingCredit: "0.00"
      }
    ],
    yearEnd: {
      bank: "11000.00",
      assets: "11000.00",
      equity: "11000.00",
      liabilities: "0.00",
      revenue: "4500.00",
      expenses: "2500.00",
      result: "2000.00"
    },
    june: {
      bank: "13500.00",
      assets: "13500.00",
      equity: "12000.00",
      liabilities: "1500.00",
      result: "3000.00"
    }
  }
} as const;

/**
 * Dashboard values live here until accounting and fiscal-year endpoints exist.
 * They must not be used as an authorization or organization data source.
 */
export interface DashboardMetric {
  change: string;
  detail: string;
  label: string;
  tone: "attention" | "negative" | "positive" | "neutral";
  value: number;
}

export interface DemoFiscalYear {
  id: string;
  label: string;
  shortLabel: string;
}

export interface LatestVoucher {
  amount: number;
  date: string;
  description: string;
  number: string;
  status: "Bokförd" | "Utkast";
}

export const demoFiscalYears: DemoFiscalYear[] = [
  {
    id: "demo-2026",
    label: "Räkenskapsår 2026",
    shortLabel: "2026"
  },
  {
    id: "demo-2025",
    label: "Räkenskapsår 2025",
    shortLabel: "2025"
  }
];

export const dashboardMockData = {
  asOf: "14 september 2026",
  currency: "SEK",
  latestVouchers: [
    {
      amount: 28450,
      date: "14 sep",
      description: "Försäljning, faktura 1042",
      number: "A-42",
      status: "Bokförd"
    },
    {
      amount: -14500,
      date: "12 sep",
      description: "Kontorshyra september",
      number: "A-41",
      status: "Bokförd"
    },
    {
      amount: -3260,
      date: "10 sep",
      description: "Programvara och licenser",
      number: "A-40",
      status: "Bokförd"
    },
    {
      amount: 19800,
      date: "8 sep",
      description: "Försäljning, faktura 1041",
      number: "A-39",
      status: "Bokförd"
    },
    {
      amount: -1125,
      date: "5 sep",
      description: "Resa och lokaltrafik",
      number: "A-38",
      status: "Utkast"
    }
  ] satisfies LatestVoucher[],
  metrics: [
    {
      change: "+12,4 %",
      detail: "jämfört med augusti",
      label: "Aktuellt resultat",
      tone: "positive",
      value: 184200
    },
    {
      change: "+8,2 %",
      detail: "jämfört med augusti",
      label: "Intäkter",
      tone: "positive",
      value: 1243000
    },
    {
      change: "+4,1 %",
      detail: "jämfört med augusti",
      label: "Kostnader",
      tone: "neutral",
      value: 1058800
    },
    {
      change: "32 500 kr",
      detail: "att betala 12 okt",
      label: "Momsposition",
      tone: "attention",
      value: 32500
    }
  ] satisfies DashboardMetric[]
};

export function formatSwedishCurrency(value: number, currency = "SEK") {
  return new Intl.NumberFormat("sv-SE", {
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    style: "currency"
  }).format(value);
}

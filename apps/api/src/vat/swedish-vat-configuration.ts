import { Prisma, VatCodeType } from "@ledgerapp/db";
import type { calculateVatReport } from "./vat-reporting-engine";

/** Ordinary domestic supplies only: not sector/rate selection or filing approval. */
export const SWEDISH_VAT_STARTER_CONFIGURATION = {
  jurisdiction: "SE",
  version: "SE-DOMESTIC-2026-01",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  reviewRequired: true,
  source:
    "https://www.skatteverket.se/foretag/moms/deklareramoms/fyllaimomsdeklarationen.4.3a2a542410ab40a421c80004214.html",
  boxes: {
    domesticBase: "05",
    outputByRate: { "25.00": "10", "12.00": "11", "6.00": "12" },
    deductibleInput: "48",
    net: "49"
  },
  codes: [
    { code: "MOMS25_UT", name: "Utgående moms 25 %", rate: "25.00", type: VatCodeType.OUTPUT },
    { code: "MOMS12_UT", name: "Utgående moms 12 %", rate: "12.00", type: VatCodeType.OUTPUT },
    { code: "MOMS6_UT", name: "Utgående moms 6 %", rate: "6.00", type: VatCodeType.OUTPUT },
    { code: "MOMS25_IN", name: "Ingående moms 25 %", rate: "25.00", type: VatCodeType.INPUT },
    { code: "MOMS12_IN", name: "Ingående moms 12 %", rate: "12.00", type: VatCodeType.INPUT },
    { code: "MOMS6_IN", name: "Ingående moms 6 %", rate: "6.00", type: VatCodeType.INPUT },
    {
      code: "INGEN_MOMS",
      name: "Ingen moms / undantag, manuell bedömning",
      rate: "0.00",
      type: VatCodeType.EXEMPT
    }
  ]
} as const;

export function mapSwedishVatReport(
  report: ReturnType<typeof calculateVatReport>,
  fromDate?: string,
  toDate?: string
) {
  const configuration = SWEDISH_VAT_STARTER_CONFIGURATION;
  const D = Prisma.Decimal.clone({ precision: 40 });
  const amounts = new Map<string, Prisma.Decimal>();
  const add = (box: string, amount: string) =>
    amounts.set(box, (amounts.get(box) ?? new D(0)).plus(amount));
  const warnings: string[] = [];
  const covered =
    (!fromDate || fromDate >= configuration.effectiveFrom) &&
    (!toDate || toDate <= configuration.effectiveTo);
  if (!covered)
    warnings.push(
      "Rapportperioden ligger utanför den svenska konfigurationsversionens giltighet; fältmappning har utelämnats."
    );
  for (const code of report.codes) {
    if (!covered) continue;
    if (code.reportingCategory === "NONE" && code.direction === "NONE") {
      warnings.push(
        `${code.code}: underlag utan moms har ingen automatisk deklarationsfältmappning; undantag/avdragsrätt kräver bedömning.`
      );
      continue;
    }
    const outputBox =
      configuration.boxes.outputByRate[code.rate as keyof typeof configuration.boxes.outputByRate];
    if (
      code.configurationVersion !== configuration.version ||
      code.reportingCategory !== "DOMESTIC_STANDARD" ||
      !outputBox
    ) {
      warnings.push(`${code.code}: konfigurationsversion eller svensk fältmappning stöds inte.`);
      continue;
    }
    if (code.direction === "OUTPUT") {
      add(configuration.boxes.domesticBase, code.taxableBase);
      add(outputBox, code.outputAmount);
    } else if (code.direction === "INPUT")
      add(configuration.boxes.deductibleInput, code.inputAmount);
  }
  const net = ["10", "11", "12"]
    .reduce((s, box) => s.plus(amounts.get(box) ?? 0), new D(0))
    .minus(amounts.get("48") ?? 0);
  amounts.set(configuration.boxes.net, net);
  const names: Record<string, string> = {
    "05": "Momspliktig inhemsk försäljning",
    "10": "Utgående 25 %",
    "11": "Utgående 12 %",
    "12": "Utgående 6 %",
    "48": "Avdragsgill ingående moms (kräver bedömning)",
    "49": "Nettomoms inom stödd omfattning"
  };
  return {
    configurationVersion: configuration.version,
    reviewRequired: true,
    complete: warnings.length === 0 && report.anomalies.length === 0,
    warnings,
    boxes: Object.entries(names).map(([box, name]) => ({
      box,
      name,
      amount: (amounts.get(box) ?? new D(0)).toFixed(2)
    }))
  };
}

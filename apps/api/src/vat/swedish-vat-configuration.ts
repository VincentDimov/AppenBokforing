import { VatCodeType } from "@ledgerapp/db";

/**
 * Current Swedish starter metadata. This is not used by the reporting engine;
 * organizations own their VAT codes and must review this template before use.
 */
export const SWEDISH_VAT_STARTER_CONFIGURATION = {
  jurisdiction: "SE",
  reviewRequired: true,
  codes: [
    { code: "MOMS25_UT", name: "Utgående moms 25 %", rate: "25.00", type: VatCodeType.OUTPUT },
    { code: "MOMS12_UT", name: "Utgående moms 12 %", rate: "12.00", type: VatCodeType.OUTPUT },
    { code: "MOMS6_UT", name: "Utgående moms 6 %", rate: "6.00", type: VatCodeType.OUTPUT },
    { code: "MOMS25_IN", name: "Ingående moms 25 %", rate: "25.00", type: VatCodeType.INPUT }
  ]
} as const;

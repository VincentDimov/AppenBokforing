import { Prisma, VatLineRole } from "@ledgerapp/db";

export type VatSnapshot = {
  id: string;
  code: string;
  name: string;
  rate: string;
  direction: "INPUT" | "OUTPUT" | "NONE";
  configurationVersion: string;
  reportingCategory: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  expectedAccountVatCodeId: string | null;
};
export type VatReportLine = {
  account: { accountNumber: string; name: string; vatCodeId: string | null };
  accountId: string;
  creditAmount: Prisma.Decimal;
  debitAmount: Prisma.Decimal;
  entryDate: Date;
  journalEntryId: string;
  vatCodeId: string | null;
  vatRole: VatLineRole;
  vatGroup: string | null;
  vatSnapshot: unknown;
  voucherLabel: string | null;
};
export type VatAnomaly = { account: string; code: string; message: string; voucher: string | null };
const D = Prisma.Decimal.clone({ precision: 40 });
const zero = () => new D(0);

export function readVatSnapshot(value: unknown): VatSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    ![
      "id",
      "code",
      "name",
      "rate",
      "configurationVersion",
      "reportingCategory",
      "effectiveFrom"
    ].every((k) => typeof v[k] === "string") ||
    !["INPUT", "OUTPUT", "NONE"].includes(String(v.direction)) ||
    !(v.effectiveTo === null || typeof v.effectiveTo === "string") ||
    !(v.expectedAccountVatCodeId === null || typeof v.expectedAccountVatCodeId === "string")
  )
    return null;
  return value as VatSnapshot;
}

/** Country-independent, pure arithmetic. Never infer base from tax/account numbers. */
export function calculateVatReport(lines: VatReportLine[]) {
  const anomalies: VatAnomaly[] = [];
  const entries = new Map<
    string,
    { debit: Prisma.Decimal; credit: Prisma.Decimal; line: VatReportLine }
  >();
  const groups = new Map<
    string,
    {
      lines: VatReportLine[];
      metadata: VatSnapshot;
      base: Prisma.Decimal;
      tax: Prisma.Decimal;
      bases: number;
      taxes: number;
    }
  >();
  const warn = (line: VatReportLine, code: string, message: string) =>
    anomalies.push({
      account: line.account.accountNumber,
      code,
      message,
      voucher: line.voucherLabel
    });
  for (const line of lines) {
    const entry = entries.get(line.journalEntryId) ?? { debit: zero(), credit: zero(), line };
    entry.debit = entry.debit.plus(line.debitAmount);
    entry.credit = entry.credit.plus(line.creditAmount);
    entries.set(line.journalEntryId, entry);
    const metadata = readVatSnapshot(line.vatSnapshot);
    const snapshot =
      line.vatSnapshot && typeof line.vatSnapshot === "object" && !Array.isArray(line.vatSnapshot)
        ? (line.vatSnapshot as Record<string, unknown>)
        : null;
    const expected =
      snapshot && "expectedAccountVatCodeId" in snapshot
        ? snapshot.expectedAccountVatCodeId
        : line.account.vatCodeId;
    if ((expected || line.vatRole === "BASE" || line.vatRole === "TAX") && !line.vatCodeId)
      warn(line, "MISSING_VAT_CODE", "Förväntad momskod saknas på raden.");
    if (expected && line.vatCodeId && expected !== line.vatCodeId)
      warn(
        line,
        "VAT_CODE_ACCOUNT_CONFLICT",
        "Radens kod avviker från kontots förväntade momskod vid postning."
      );
    if (!line.vatCodeId) continue;
    if (!metadata || metadata.id !== line.vatCodeId) {
      warn(
        line,
        "MISSING_VAT_SNAPSHOT",
        "Historisk momskonfiguration saknas; raden har inte tolkats som moms."
      );
      continue;
    }
    if (line.vatRole !== "BASE" && line.vatRole !== "TAX") {
      warn(line, "UNCLASSIFIED_VAT_LINE", "Momskod finns men underlag/moms-roll saknas.");
      continue;
    }
    let rate: Prisma.Decimal;
    try {
      rate = new D(metadata.rate);
    } catch {
      warn(line, "INVALID_RATE", "Ogiltig momssats.");
      continue;
    }
    if (
      !rate.isFinite() ||
      rate.lt(0) ||
      rate.gt(100) ||
      rate.decimalPlaces() > 2 ||
      (metadata.direction === "NONE" && !rate.isZero())
    ) {
      warn(line, "INVALID_RATE", "Momssats måste vara 0–100 %, med noll för NONE.");
      continue;
    }
    const key = JSON.stringify([line.journalEntryId, line.vatGroup ?? metadata.id]);
    const group = groups.get(key) ?? {
      lines: [],
      metadata,
      base: zero(),
      tax: zero(),
      bases: 0,
      taxes: 0
    };
    if (
      group.metadata.id !== metadata.id ||
      group.metadata.configurationVersion !== metadata.configurationVersion ||
      group.metadata.rate !== metadata.rate ||
      group.metadata.direction !== metadata.direction
    )
      warn(
        line,
        "MIXED_VAT_CODES",
        "Samma momsgrupp innehåller olika koder eller konfigurationsversioner."
      );
    group.lines.push(line);
    const signed =
      metadata.direction === "OUTPUT"
        ? new D(line.creditAmount.toString()).minus(line.debitAmount)
        : new D(line.debitAmount.toString()).minus(line.creditAmount);
    if (line.vatRole === "BASE") {
      group.base = group.base.plus(signed);
      group.bases++;
    } else {
      group.tax = group.tax.plus(signed);
      group.taxes++;
    }
    groups.set(key, group);
  }
  for (const entry of entries.values())
    if (!entry.debit.eq(entry.credit))
      warn(entry.line, "UNBALANCED_ENTRY", "Bokförd verifikation är inte balanserad.");
  const byCode = new Map<
    string,
    { metadata: VatSnapshot; base: Prisma.Decimal; tax: Prisma.Decimal }
  >();
  for (const group of groups.values()) {
    const line = group.lines[0]!;
    const rate = new D(group.metadata.rate);
    if (!group.bases && group.taxes)
      warn(line, "ORPHAN_TAX", "Momsrad saknar uttryckligt underlag i samma verifikation/grupp.");
    if (group.bases && !group.taxes && !rate.isZero())
      warn(line, "MISSING_TAX_LINE", "Underlag saknar förväntad momsrad.");
    if (group.metadata.direction === "NONE" && group.taxes)
      warn(line, "UNEXPECTED_VAT_AMOUNT", "NONE får inte ha momsrad.");
    if (group.bases && group.taxes && group.base.times(group.tax).lt(0))
      warn(
        line,
        "UNEXPECTED_VAT_SIDE",
        "Moms och underlag har motsatta riktningar. Matchande negativa kreditnotor är tillåtna."
      );
    const expectedTax = group.base.times(rate).div(100).toDecimalPlaces(2, D.ROUND_HALF_UP);
    if (!expectedTax.eq(group.tax))
      warn(
        line,
        "RATE_BASE_MISMATCH",
        `Underlag × sats ger ${expectedTax.toFixed(2)}, bokförd moms är ${group.tax.toFixed(2)}.`
      );
    const key = JSON.stringify([
      group.metadata.id,
      group.metadata.configurationVersion,
      group.metadata.rate,
      group.metadata.direction,
      group.metadata.reportingCategory
    ]);
    const bucket = byCode.get(key) ?? { metadata: group.metadata, base: zero(), tax: zero() };
    bucket.base = bucket.base.plus(group.base);
    bucket.tax = bucket.tax.plus(group.tax);
    byCode.set(key, bucket);
  }
  const codes = [...byCode.values()]
    .sort(
      (a, b) =>
        a.metadata.code.localeCompare(b.metadata.code) ||
        a.metadata.configurationVersion.localeCompare(b.metadata.configurationVersion)
    )
    .map(({ metadata, base, tax }) => ({
      ...metadata,
      type: metadata.direction,
      taxableBase: base.toFixed(2),
      inputAmount: (metadata.direction === "INPUT" ? tax : zero()).toFixed(2),
      outputAmount: (metadata.direction === "OUTPUT" ? tax : zero()).toFixed(2)
    }));
  const sum = (field: "taxableBase" | "inputAmount" | "outputAmount", direction?: string) =>
    codes
      .filter((c) => !direction || c.direction === direction)
      .reduce((s, c) => s.plus(c[field]), zero());
  const inputVat = sum("inputAmount"),
    outputVat = sum("outputAmount");
  return {
    anomalies,
    codes,
    reviewRequired: true as const,
    totals: {
      outputBase: sum("taxableBase", "OUTPUT").toFixed(2),
      inputBase: sum("taxableBase", "INPUT").toFixed(2),
      nonVatBase: sum("taxableBase", "NONE").toFixed(2),
      inputVat: inputVat.toFixed(2),
      outputVat: outputVat.toFixed(2),
      vatPosition: outputVat.minus(inputVat).toFixed(2)
    }
  };
}

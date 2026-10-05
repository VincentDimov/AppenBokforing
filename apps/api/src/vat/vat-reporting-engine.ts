import { Prisma, VatCodeType } from "@ledgerapp/db";

export type VatReportLine = {
  account: { accountNumber: string; name: string; vatCodeId: string | null };
  accountId: string;
  creditAmount: Prisma.Decimal;
  debitAmount: Prisma.Decimal;
  entryDate: Date;
  journalEntryId: string;
  vatCode: {
    code: string;
    id: string;
    name: string;
    rate: Prisma.Decimal;
    type: VatCodeType;
  } | null;
  vatCodeId: string | null;
  voucherLabel: string | null;
};

export type VatAnomaly = {
  account: string;
  code:
    "MISSING_VAT_CODE" | "UNEXPECTED_VAT_AMOUNT" | "VAT_CODE_ACCOUNT_CONFLICT" | "UNBALANCED_ENTRY";
  message: string;
  voucher: string | null;
};

/**
 * Generic VAT calculation engine. It is deliberately unaware of a country's
 * return boxes, filing cadence, or statutory exceptions. It works only from
 * tenant-configured VAT metadata and immutable posted journal lines.
 */
export function calculateVatReport(lines: VatReportLine[]) {
  const anomalies: VatAnomaly[] = [];
  const byCode = new Map<
    string,
    {
      code: string;
      input: Prisma.Decimal;
      name: string;
      output: Prisma.Decimal;
      rate: string;
      type: VatCodeType;
    }
  >();
  const entryTotals = new Map<
    string,
    { account: string; credit: Prisma.Decimal; debit: Prisma.Decimal; voucher: string | null }
  >();

  for (const line of lines) {
    const entry = entryTotals.get(line.journalEntryId) ?? {
      account: line.account.accountNumber,
      credit: new Prisma.Decimal(0),
      debit: new Prisma.Decimal(0),
      voucher: line.voucherLabel
    };
    entry.credit = entry.credit.plus(line.creditAmount);
    entry.debit = entry.debit.plus(line.debitAmount);
    entryTotals.set(line.journalEntryId, entry);

    if (line.account.vatCodeId && !line.vatCodeId) {
      anomalies.push({
        account: line.account.accountNumber,
        code: "MISSING_VAT_CODE",
        message: "Kontot har en förväntad VAT-kod men raden saknar VAT-kod.",
        voucher: line.voucherLabel
      });
    }
    if (line.account.vatCodeId && line.vatCodeId && line.account.vatCodeId !== line.vatCodeId) {
      anomalies.push({
        account: line.account.accountNumber,
        code: "VAT_CODE_ACCOUNT_CONFLICT",
        message: "Radens VAT-kod avviker från kontots konfigurerade VAT-kod.",
        voucher: line.voucherLabel
      });
    }
    if (!line.vatCode) continue;

    const bucket = byCode.get(line.vatCode.id) ?? {
      code: line.vatCode.code,
      input: new Prisma.Decimal(0),
      name: line.vatCode.name,
      output: new Prisma.Decimal(0),
      rate: line.vatCode.rate.toFixed(2),
      type: line.vatCode.type
    };
    const signed = line.debitAmount.minus(line.creditAmount);
    if (line.vatCode.type === VatCodeType.INPUT) {
      bucket.input = bucket.input.plus(signed);
      if (signed.isNegative())
        anomalies.push({
          account: line.account.accountNumber,
          code: "UNEXPECTED_VAT_AMOUNT",
          message: "Ingående VAT-kod har ett kreditsaldo på raden.",
          voucher: line.voucherLabel
        });
    } else if (line.vatCode.type === VatCodeType.OUTPUT) {
      bucket.output = bucket.output.plus(signed.negated());
      if (signed.isPositive())
        anomalies.push({
          account: line.account.accountNumber,
          code: "UNEXPECTED_VAT_AMOUNT",
          message: "Utgående VAT-kod har ett debetsaldo på raden.",
          voucher: line.voucherLabel
        });
    } else if (!signed.isZero()) {
      anomalies.push({
        account: line.account.accountNumber,
        code: "UNEXPECTED_VAT_AMOUNT",
        message: "Undantagen VAT-kod har ett belopp som kräver manuell bedömning.",
        voucher: line.voucherLabel
      });
    }
    byCode.set(line.vatCode.id, bucket);
  }
  for (const entry of entryTotals.values()) {
    if (!entry.debit.equals(entry.credit))
      anomalies.push({
        account: entry.account,
        code: "UNBALANCED_ENTRY",
        message: "Bokförd verifikation är inte balanserad.",
        voucher: entry.voucher
      });
  }
  const codes = [...byCode.values()]
    .sort((left, right) => left.code.localeCompare(right.code))
    .map((code) => ({
      ...code,
      inputAmount: code.input.toFixed(2),
      outputAmount: code.output.toFixed(2)
    }));
  const inputVat = codes.reduce(
    (total, code) => total.plus(code.inputAmount),
    new Prisma.Decimal(0)
  );
  const outputVat = codes.reduce(
    (total, code) => total.plus(code.outputAmount),
    new Prisma.Decimal(0)
  );
  return {
    anomalies,
    codes,
    totals: {
      inputVat: inputVat.toFixed(2),
      outputVat: outputVat.toFixed(2),
      vatPosition: outputVat.minus(inputVat).toFixed(2)
    }
  };
}

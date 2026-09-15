export interface VoucherAmounts {
  credit: bigint;
  debit: bigint;
  difference: bigint;
}

export interface VoucherAmountLine {
  credit: string;
  debit: string;
}

const moneyPattern = /^(?:0|[1-9]\d*)(?:[.,]\d{1,2})?$/;

/**
 * UI totals intentionally use integer öre, never JavaScript floating point.
 * The API remains the accounting authority and validates the same values with
 * PostgreSQL NUMERIC/Prisma Decimal on save and post.
 */
export function parseMoneyToOre(value: string): bigint | null {
  const normalized = value.trim();

  if (!moneyPattern.test(normalized)) {
    return null;
  }

  const [whole = "0", fraction = ""] = normalized.replace(",", ".").split(".");
  const ore = `${fraction}00`.slice(0, 2);

  return BigInt(whole) * 100n + BigInt(ore);
}

export function calculateVoucherAmounts(lines: VoucherAmountLine[]): VoucherAmounts | null {
  let debit = 0n;
  let credit = 0n;

  for (const line of lines) {
    const lineDebit = parseMoneyToOre(line.debit);
    const lineCredit = parseMoneyToOre(line.credit);

    if (lineDebit === null || lineCredit === null) {
      return null;
    }

    debit += lineDebit;
    credit += lineCredit;
  }

  return { credit, debit, difference: debit - credit };
}

export function formatOre(value: bigint): string {
  const sign = value < 0n ? "−" : "";
  const absolute = value < 0n ? -value : value;
  const kronor = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const ore = (absolute % 100n).toString().padStart(2, "0");

  return `${sign}${kronor},${ore}`;
}

export function isValidJournalAmountLine(line: VoucherAmountLine): boolean {
  const debit = parseMoneyToOre(line.debit);
  const credit = parseMoneyToOre(line.credit);

  return (
    debit !== null &&
    credit !== null &&
    ((debit > 0n && credit === 0n) || (credit > 0n && debit === 0n))
  );
}

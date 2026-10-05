export const SIE_VARIANT = "SIE 4B export / practical SIE4 import subset";
export type SieAccount = { number: string; name: string };
export type SieTransaction = {
  account: string;
  amount: string;
  date?: string;
  text?: string;
  objects: Array<{ dimension: string; object: string }>;
};
export type SieVoucher = {
  date: string;
  number: string;
  series: string;
  text: string;
  transactions: SieTransaction[];
};
export type SieDocument = {
  accounts: SieAccount[];
  fiscalYear?: { end: string; start: string };
  openingBalances: Array<{ account: string; amount: string }>;
  organization?: { name?: string; number?: string };
  vouchers: SieVoucher[];
  warnings: string[];
  errors: string[];
};
const quote = (value: string) => `"${value.replaceAll('"', "'")}"`;
const parseDate = (value: string) =>
  /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : undefined;
const sieDate = (value: string) => value.replaceAll("-", "");
const tokenize = (line: string) =>
  [...line.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|\{|\}|[^\s{}]+/g)].map(
    (match) => match[1] ?? match[0]
  );
export function parseSie4(content: string): SieDocument {
  const document: SieDocument = {
    accounts: [],
    openingBalances: [],
    vouchers: [],
    warnings: [],
    errors: []
  };
  let current: SieVoucher | undefined;
  for (const [index, raw] of content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .entries()) {
    const tokens = tokenize(raw.trim());
    const tag = tokens[0];
    if (!tag || tag.startsWith("#FLAGGA")) continue;
    const line = index + 1;
    if (tag === "#SIETYP" && tokens[1] !== "4")
      document.errors.push(`Rad ${line}: endast SIE typ 4 stöds.`);
    else if (tag === "#ORGNR")
      document.organization = { ...document.organization, number: tokens[1] };
    else if (tag === "#FNAMN")
      document.organization = { ...document.organization, name: tokens[1] };
    else if (tag === "#RAR") {
      const start = parseDate(tokens[2] ?? ""),
        end = parseDate(tokens[3] ?? "");
      if (start && end) document.fiscalYear = { start, end };
      else document.errors.push(`Rad ${line}: ogiltigt räkenskapsår.`);
    } else if (tag === "#KONTO") {
      if (tokens[1] && tokens[2]) document.accounts.push({ number: tokens[1], name: tokens[2] });
      else document.errors.push(`Rad ${line}: ogiltigt konto.`);
    } else if (tag === "#IB") {
      if (tokens[2] && tokens[3])
        document.openingBalances.push({ account: tokens[2], amount: tokens[3] });
    } else if (tag === "#VER") {
      const date = parseDate(tokens[3] ?? "");
      if (!tokens[1] || !tokens[2] || !date)
        document.errors.push(`Rad ${line}: ogiltig verifikation.`);
      else {
        current = {
          series: tokens[1],
          number: tokens[2],
          date,
          text: tokens[4] ?? "",
          transactions: []
        };
        document.vouchers.push(current);
      }
    } else if (tag === "#TRANS") {
      if (!current) {
        document.errors.push(`Rad ${line}: transaktion saknar verifikation.`);
        continue;
      }
      const close = tokens.indexOf("}");
      const objectTokens = tokens.slice(2, close < 0 ? 2 : close);
      const objects = [] as SieTransaction["objects"];
      for (let i = 0; i + 1 < objectTokens.length; i += 2)
        objects.push({ dimension: objectTokens[i]!, object: objectTokens[i + 1]! });
      const amount = tokens[close < 0 ? 2 : close + 1];
      if (!tokens[1] || !amount) document.errors.push(`Rad ${line}: ogiltig transaktion.`);
      else
        current.transactions.push({
          account: tokens[1],
          objects,
          amount,
          date: parseDate(tokens[close < 0 ? 3 : close + 2] ?? ""),
          text: tokens[close < 0 ? 4 : close + 3]
        });
    } else if (
      ![
        "{",
        "}",
        "#PROGRAM",
        "#FORMAT",
        "#GEN",
        "#DIM",
        "#UNDERDIM",
        "#OBJEKT",
        "#OIB",
        "#UB",
        "#RES",
        "#RTRANS",
        "#BTRANS"
      ].includes(tag)
    )
      document.warnings.push(`Rad ${line}: ${tag} ignorerades.`);
  }
  for (const voucher of document.vouchers) {
    const sum = voucher.transactions.reduce((total, line) => total + Number(line.amount), 0);
    if (!Number.isFinite(sum) || Math.abs(sum) > 0.005)
      document.errors.push(`Verifikation ${voucher.series}${voucher.number} balanserar inte.`);
  }
  return document;
}
export type SieExportData = {
  accounts: SieAccount[];
  balances: Array<{ account: string; opening: string; closing: string }>;
  fiscalYear: { start: string; end: string };
  organization: { name: string; number?: string };
  vouchers: SieVoucher[];
  objects?: Array<{ dimension: string; id: string; name: string }>;
};
export function exportSie4(data: SieExportData): string {
  const lines = [
    "#FLAGGA 0",
    `#PROGRAM ${quote("LedgerApp")} ${quote("0.1")}`,
    "#FORMAT PC8",
    "#SIETYP 4",
    data.organization.number ? `#ORGNR ${quote(data.organization.number)}` : "",
    `#FNAMN ${quote(data.organization.name)}`,
    `#RAR 0 ${sieDate(data.fiscalYear.start)} ${sieDate(data.fiscalYear.end)}`
  ].filter(Boolean);
  for (const account of data.accounts)
    lines.push(`#KONTO ${account.number} ${quote(account.name)}`);
  for (const balance of data.balances) {
    lines.push(`#IB 0 ${balance.account} ${balance.opening}`);
    lines.push(`#UB 0 ${balance.account} ${balance.closing}`);
  }
  for (const object of data.objects ?? [])
    lines.push(`#OBJEKT ${object.dimension} ${quote(object.id)} ${quote(object.name)}`);
  for (const voucher of data.vouchers) {
    lines.push(
      `#VER ${quote(voucher.series)} ${voucher.number} ${sieDate(voucher.date)} ${quote(voucher.text)}`,
      "{"
    );
    for (const transaction of voucher.transactions) {
      const objects = transaction.objects.length
        ? `{${transaction.objects.map((o) => `${o.dimension} ${quote(o.object)}`).join(" ")}}`
        : "{}";
      lines.push(
        `#TRANS ${transaction.account} ${objects} ${transaction.amount} ${transaction.date ? sieDate(transaction.date) : ""} ${quote(transaction.text ?? "")}`.trim()
      );
    }
    lines.push("}");
  }
  return `${lines.join("\r\n")}\r\n`;
}

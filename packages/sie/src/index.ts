export const SIE_VARIANT = "SIE 4B limited loss-aware PC8 subset; not certified";
export type SieAccount = { number: string; name: string; type?: "T" | "S" | "I" | "K" };
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
  fiscalYear?: { start: string; end: string };
  fiscalYears: Array<{ index: string; start: string; end: string }>;
  openingBalances: Array<{ account: string; amount: string; yearIndex: string }>;
  balances: Array<{ tag: string; account: string; amount: string; yearIndex: string }>;
  objects: Array<{ dimension: string; id: string; name: string }>;
  organization?: { name?: string; number?: string };
  vouchers: SieVoucher[];
  warnings: string[];
  errors: string[];
};
// IBM CP437 bytes 128..255, in byte order (no locale-dependent decoding).
const high =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
export function decodeSieBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => (b < 128 ? String.fromCharCode(b) : high[b - 128]!)).join("");
}
export function encodeSieBytes(text: string): Uint8Array {
  return Uint8Array.from(
    Array.from(text, (ch) => {
      const code = ch.codePointAt(0)!;
      if (code < 128) return code;
      const index = high.indexOf(ch);
      if (index < 0) throw new Error("Text cannot be represented losslessly in PC8/CP437.");
      return index + 128;
    })
  );
}
export function moneyCents(value: string): bigint {
  if (!/^[+-]?\d{1,16}(?:\.\d{1,2})?$/.test(value))
    throw new Error("Invalid NUMERIC(18,2) amount.");
  const [whole, fraction = ""] = value.replace(/^[+-]/, "").split(".");
  const result = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  return value.startsWith("-") ? -result : result;
}
export function centsMoney(value: bigint): string {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
function quote(value: string): string {
  if (/[\x00-\x1f\x7f]/.test(value) || /\\["\\]|\\$/.test(value))
    throw new Error("Control characters/ambiguous backslashes are forbidden in SIE fields.");
  return `"${value.replaceAll('"', '\\"')}"`;
}
function parseDate(value: string): string | undefined {
  if (!/^\d{8}$/.test(value)) return undefined;
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : undefined;
}
function sieDate(value: string): string {
  const compact = value.replaceAll("-", "");
  if (!parseDate(compact)) throw new Error("Invalid SIE date.");
  return compact;
}
function tokenize(line: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (/\s/.test(line[i]!)) {
      i++;
      continue;
    }
    if (line[i] === '"') {
      i++;
      let value = "",
        closed = false;
      while (i < line.length) {
        if (line[i] === "\\" && line[i + 1] === '"') {
          value += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          closed = true;
          break;
        } else value += line[i++]!;
      }
      if (!closed || (i < line.length && !/[\s{}]/.test(line[i]!)))
        throw new Error("Malformed quoted field.");
      result.push(value);
    } else if (/[{}]/.test(line[i]!)) result.push(line[i++]!);
    else {
      const start = i;
      while (i < line.length && !/[\s{}]/.test(line[i]!)) i++;
      result.push(line.slice(start, i));
    }
  }
  return result;
}
const identifier = (value: string) => /^[A-Za-z0-9ÅÄÖåäö_.-]{1,20}$/.test(value);
const accountNumber = (value: string) => /^\d{4,10}$/.test(value);
export function parseSie4(content: string | Uint8Array): SieDocument {
  const text = typeof content === "string" ? content : decodeSieBytes(content);
  const d: SieDocument = {
    accounts: [],
    fiscalYears: [],
    openingBalances: [],
    balances: [],
    objects: [],
    vouchers: [],
    warnings: [],
    errors: []
  };
  let current: SieVoucher | undefined,
    block = false,
    typeSeen = false;
  const types = new Map<string, SieAccount["type"]>();
  for (const [index, raw] of text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .entries()) {
    try {
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw))
        throw new Error("Forbidden control character.");
      const t = tokenize(raw.trim()),
        tag = t[0];
      if (!tag) continue;
      if (tag === "{") {
        if (!current || block || t.length !== 1) throw new Error("Unexpected voucher block.");
        block = true;
      } else if (tag === "}") {
        if (!current || !block || t.length !== 1) throw new Error("Unexpected block end.");
        current = undefined;
        block = false;
      } else if (tag === "#SIETYP") {
        typeSeen = true;
        if (t[1] !== "4") throw new Error("Only SIE type 4 is supported.");
      } else if (tag === "#FORMAT") {
        if (t[1] !== "PC8") throw new Error("Only PC8/CP437 is supported.");
      } else if (tag === "#ORGNR") d.organization = { ...d.organization, number: t[1] };
      else if (tag === "#FNAMN") d.organization = { ...d.organization, name: t[1] };
      else if (tag === "#RAR") {
        const start = parseDate(t[2] ?? ""),
          end = parseDate(t[3] ?? "");
        if (!start || !end || start > end || !/^(0|-[1-9]\d*)$/.test(t[1] ?? ""))
          throw new Error("Invalid fiscal year.");
        if (d.fiscalYears.some((y) => y.index === t[1]))
          throw new Error("Duplicate fiscal year index.");
        d.fiscalYears.push({ index: t[1]!, start, end });
        if (t[1] === "0") d.fiscalYear = { start, end };
        else
          d.warnings.push(
            `Previous fiscal year ${t[1]} is reference metadata only; target mapping is index 0.`
          );
      } else if (tag === "#KONTO") {
        if (
          !accountNumber(t[1] ?? "") ||
          !t[2] ||
          t[2].length > 160 ||
          d.accounts.some((a) => a.number === t[1])
        )
          throw new Error("Invalid/duplicate account.");
        d.accounts.push({ number: t[1]!, name: t[2] });
      } else if (tag === "#KTYP") {
        if (!accountNumber(t[1] ?? "") || !/^[TSIK]$/.test(t[2] ?? ""))
          throw new Error("Invalid account type.");
        types.set(t[1]!, t[2] as SieAccount["type"]);
      } else if (["#IB", "#UB", "#RES"].includes(tag)) {
        if (!accountNumber(t[2] ?? "") || !/^(0|-[1-9]\d*)$/.test(t[1] ?? ""))
          throw new Error("Invalid balance identity.");
        const amount = centsMoney(moneyCents(t[3] ?? ""));
        if (t[4] !== undefined) throw new Error("Quantity balances are unsupported.");
        if (t[1] !== "0")
          throw new Error(
            "Previous-year balances require a separate mapped import; no silent loss."
          );
        if (tag === "#IB") d.openingBalances.push({ account: t[2]!, amount, yearIndex: t[1]! });
        else d.balances.push({ tag, account: t[2]!, amount, yearIndex: t[1]! });
      } else if (tag === "#DIM") {
        if (!["1", "6"].includes(t[1] ?? ""))
          d.warnings.push(`Unused dimension ${t[1]} is unsupported.`);
      } else if (tag === "#OBJEKT") {
        if (
          !["1", "6"].includes(t[1] ?? "") ||
          !identifier(t[2] ?? "") ||
          !t[3] ||
          t[3].length > 160
        )
          throw new Error("Unsupported/invalid object dimension (only 1 and 6).");
        if (d.objects.some((o) => o.dimension === t[1] && o.id === t[2]))
          throw new Error("Duplicate object.");
        d.objects.push({ dimension: t[1]!, id: t[2]!, name: t[3] });
      } else if (tag === "#VER") {
        const date = parseDate(t[3] ?? "");
        if (
          current ||
          block ||
          !identifier(t[1] ?? "") ||
          !/^[1-9]\d{0,9}$/.test(t[2] ?? "") ||
          BigInt(t[2]!) >= 2147483647n ||
          !date ||
          (t[4]?.length ?? 0) > 500
        )
          throw new Error("Invalid voucher identity/date/block.");
        if (t.slice(5).some((v) => v !== ""))
          throw new Error("Registration date/signature is unsupported.");
        if (d.vouchers.some((v) => v.series === t[1] && v.number === t[2]))
          throw new Error("Duplicate voucher identity.");
        current = { series: t[1]!, number: t[2]!, date, text: t[4] ?? "", transactions: [] };
        d.vouchers.push(current);
      } else if (tag === "#TRANS") {
        if (!current || !block) throw new Error("Transaction outside voucher block.");
        const close = t.indexOf("}");
        if (!accountNumber(t[1] ?? "") || t[2] !== "{" || close < 3 || (close - 3) % 2 !== 0)
          throw new Error("Invalid transaction/object list.");
        const objects: SieTransaction["objects"] = [];
        for (let i = 3; i < close; i += 2) {
          if (
            !["1", "6"].includes(t[i]!) ||
            !identifier(t[i + 1]!) ||
            objects.some((o) => o.dimension === t[i])
          )
            throw new Error("Unsupported/duplicate transaction dimension.");
          objects.push({ dimension: t[i]!, object: t[i + 1]! });
        }
        const amount = centsMoney(moneyCents(t[close + 1] ?? ""));
        const dateToken = t[close + 2],
          date = dateToken ? parseDate(dateToken) : undefined;
        if (dateToken && !date)
          throw new Error("Invalid line date (use an empty quoted field when omitted).");
        if (t.slice(close + 4).some((v) => v !== ""))
          throw new Error("Quantity/signature is unsupported.");
        if ((t[close + 3]?.length ?? 0) > 500) throw new Error("Line text too long.");
        current.transactions.push({ account: t[1]!, amount, date, text: t[close + 3], objects });
      } else if (
        [
          "#FLAGGA",
          "#PROGRAM",
          "#GEN",
          "#PROSA",
          "#ADRESS",
          "#FNR",
          "#BKOD",
          "#FTYP",
          "#KPTYP",
          "#TAXAR",
          "#SRU"
        ].includes(tag)
      ) {
        if (!["#FLAGGA", "#PROGRAM", "#GEN"].includes(tag))
          d.warnings.push(`Descriptive metadata ${tag} is not persisted.`);
      } else if (tag === "#VALUTA" && t[1] === "SEK") {
        /* application currency */
      } else throw new Error(`Unsupported record ${tag}: confirmation blocked to prevent loss.`);
    } catch (error) {
      d.errors.push(`Rad ${index + 1}: ${(error as Error).message}`);
    }
  }
  if (!typeSeen) d.errors.push("Missing #SIETYP 4.");
  if (current || block) d.errors.push("Unclosed voucher block.");
  for (const a of d.accounts) a.type = types.get(a.number);
  for (const v of d.vouchers) {
    if (
      v.transactions.reduce((sum, t) => sum + moneyCents(t.amount), 0n) !== 0n ||
      v.transactions.filter((t) => moneyCents(t.amount) !== 0n).length < 2
    )
      d.errors.push(
        `Verifikation ${v.series}${v.number} balanserar inte eller saknar två giltiga rader.`
      );
    if (d.fiscalYear && (v.date < d.fiscalYear.start || v.date > d.fiscalYear.end))
      d.errors.push("Voucher is outside #RAR 0.");
    for (const t of v.transactions) {
      if (t.date && d.fiscalYear && (t.date < d.fiscalYear.start || t.date > d.fiscalYear.end))
        d.errors.push("Line date is outside #RAR 0.");
      for (const o of t.objects)
        if (
          !d.objects.some(
            (candidate) => candidate.dimension === o.dimension && candidate.id === o.object
          )
        )
          d.errors.push("Transaction references an undeclared object.");
    }
  }
  const ibAccounts = new Set<string>();
  for (const b of d.openingBalances) {
    if (ibAccounts.has(b.account)) d.errors.push("Duplicate opening balance.");
    ibAccounts.add(b.account);
  }
  if (d.openingBalances.reduce((sum, b) => sum + moneyCents(b.amount), 0n) !== 0n)
    d.errors.push("Opening balances do not balance.");
  const closing = new Map(d.openingBalances.map((b) => [b.account, moneyCents(b.amount)]));
  for (const v of d.vouchers)
    for (const t of v.transactions)
      closing.set(t.account, (closing.get(t.account) ?? 0n) + moneyCents(t.amount));
  const declared = new Set<string>();
  for (const b of d.balances) {
    if (declared.has(b.account)) d.errors.push("Duplicate closing/result balance.");
    declared.add(b.account);
    if ((closing.get(b.account) ?? 0n) !== moneyCents(b.amount))
      d.errors.push(
        `Closing/result balance for ${b.account} disagrees with opening balances and transactions.`
      );
  }
  return d;
}
export type SieExportData = {
  generatedDate?: string;
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
    '#PROGRAM "LedgerApp" "0.1"',
    "#FORMAT PC8",
    "#SIETYP 4",
    `#GEN ${sieDate(data.generatedDate ?? new Date().toISOString().slice(0, 10))} "LedgerApp"`,
    ...(data.organization.number ? [`#ORGNR ${quote(data.organization.number)}`] : []),
    `#FNAMN ${quote(data.organization.name)}`,
    `#RAR 0 ${sieDate(data.fiscalYear.start)} ${sieDate(data.fiscalYear.end)}`
  ];
  const types = new Map(data.accounts.map((a) => [a.number, a.type]));
  for (const a of [...data.accounts].sort((a, b) => a.number.localeCompare(b.number))) {
    if (!accountNumber(a.number)) throw new Error("Invalid export account identity.");
    lines.push(`#KONTO ${a.number} ${quote(a.name)}`);
    if (a.type) lines.push(`#KTYP ${a.number} ${a.type}`);
  }
  for (const b of [...data.balances].sort((a, b) => a.account.localeCompare(b.account))) {
    if (!accountNumber(b.account)) throw new Error("Invalid balance account.");
    if (["I", "K"].includes(types.get(b.account) ?? "")) {
      if (moneyCents(b.opening) !== 0n)
        throw new Error("Opening balance on result account is unsupported.");
      lines.push(`#RES 0 ${b.account} ${centsMoney(moneyCents(b.closing))}`);
    } else
      lines.push(
        `#IB 0 ${b.account} ${centsMoney(moneyCents(b.opening))}`,
        `#UB 0 ${b.account} ${centsMoney(moneyCents(b.closing))}`
      );
  }
  lines.push('#DIM 1 "Kostnadsställe"', '#DIM 6 "Projekt"');
  for (const o of [...(data.objects ?? [])].sort((a, b) =>
    `${a.dimension}/${a.id}`.localeCompare(`${b.dimension}/${b.id}`)
  ))
    lines.push(`#OBJEKT ${o.dimension} ${quote(o.id)} ${quote(o.name)}`);
  for (const v of [...data.vouchers].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.series.localeCompare(b.series) ||
      (BigInt(a.number) < BigInt(b.number) ? -1 : 1)
  )) {
    lines.push(`#VER ${quote(v.series)} ${v.number} ${sieDate(v.date)} ${quote(v.text)}`, "{");
    for (const t of v.transactions) {
      const objects = `{${[...t.objects]
        .sort((a, b) => a.dimension.localeCompare(b.dimension))
        .map((o) => `${o.dimension} ${quote(o.object)}`)
        .join(" ")}}`;
      lines.push(
        `#TRANS ${t.account} ${objects} ${centsMoney(moneyCents(t.amount))} ${t.date ? sieDate(t.date) : '""'} ${quote(t.text ?? "")}`
      );
    }
    lines.push("}");
  }
  const output = `${lines.join("\r\n")}\r\n`;
  const validation = parseSie4(output);
  if (validation.errors.length)
    throw new Error(`Invalid SIE export: ${validation.errors.join(" ")}`);
  encodeSieBytes(output);
  return output;
}
export const exportSie4Bytes = (data: SieExportData): Uint8Array =>
  encodeSieBytes(exportSie4(data));

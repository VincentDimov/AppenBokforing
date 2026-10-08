export type CsvCell = { value: string; kind: "text" | "decimal" };
export const textCell = (value: string): CsvCell => ({ value, kind: "text" });
export const decimalCell = (value: string): CsvCell => ({ value, kind: "decimal" });
export function encodeCsv(rows: CsvCell[][]): string {
  if (rows.length > 30000) throw new Error("Rapporten överstiger exportgränsen. Begränsa urvalet.");
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map((cell) => {
            let value = cell.value;
            if (cell.kind === "decimal") {
              if (!/^-?\d+(?:\.\d+)?$/.test(value))
                throw new Error("Ogiltigt decimalvärde i rapporten.");
            } else if (/^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value))
              value = "'" + value;
            return '"' + value.replaceAll('"', '""') + '"';
          })
          .join(";")
      )
      .join("\r\n") +
    "\r\n"
  );
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const array = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown) => (typeof value === "string" ? value : "");
const names: Record<string, string> = {
  "general-ledger": "Huvudbok",
  "trial-balance": "Saldobalans",
  "income-statement": "Resultaträkning",
  "balance-sheet": "Balansräkning",
  vat: "Momsrapport"
};
export function reportCsv(
  report: unknown,
  url: string,
  org: { name: string; organizationNumber?: string | null }
): string {
  const data = object(report),
    parsed = new URL(url, "https://local.invalid"),
    kind = parsed.pathname.split("/").at(-1)!;
  const rows: CsvCell[][] = [
    [textCell("Organisation"), textCell(org.name)],
    [textCell("Organisationsnummer"), textCell(org.organizationNumber ?? "")],
    [textCell("Rapport"), textCell(names[kind] ?? kind)],
    [textCell("Räkenskapsår"), textCell(text(object(data.fiscalYear).name))]
  ];
  for (const [key, value] of [...parsed.searchParams.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  ))
    rows.push([textCell(key), textCell(value)]);
  rows.push([textCell("Genererad UTC"), textCell(new Date().toISOString())], []);
  const header = (...values: string[]) => rows.push(values.map(textCell));
  const emit = (
    record: Record<string, unknown>,
    fields: string[],
    decimals: string[],
    prefix: string[] = []
  ) =>
    rows.push([
      ...prefix.map(textCell),
      ...fields.map((key) =>
        decimals.includes(key) ? decimalCell(text(record[key])) : textCell(text(record[key]))
      )
    ]);
  if (kind === "general-ledger") {
    header("Konto", "Namn", "Datum", "Verifikation", "Beskrivning", "Debet", "Kredit", "Saldo");
    for (const account of array(data.accounts)) {
      const identity = object(account.account),
        prefix = [text(identity.number), text(identity.name)];
      rows.push([
        ...prefix.map(textCell),
        textCell(""),
        textCell(""),
        textCell("Ingående saldo"),
        decimalCell("0.00"),
        decimalCell("0.00"),
        decimalCell(text(account.openingBalance))
      ]);
      for (const line of array(account.transactions))
        emit(
          line,
          ["date", "voucher", "description", "debit", "credit", "runningBalance"],
          ["debit", "credit", "runningBalance"],
          prefix
        );
      rows.push([
        ...prefix.map(textCell),
        textCell(""),
        textCell(""),
        textCell("Utgående saldo"),
        decimalCell("0.00"),
        decimalCell("0.00"),
        decimalCell(text(account.closingBalance))
      ]);
    }
  } else if (kind === "trial-balance") {
    const fields = [
      "openingDebit",
      "openingCredit",
      "periodDebit",
      "periodCredit",
      "closingDebit",
      "closingCredit"
    ];
    header(
      "Konto",
      "Namn",
      "IB debet",
      "IB kredit",
      "Period debet",
      "Period kredit",
      "UB debet",
      "UB kredit"
    );
    for (const account of array(data.accounts))
      emit(account, ["number", "name", ...fields], fields);
  } else if (kind === "income-statement" || kind === "balance-sheet") {
    const fields =
      kind === "income-statement"
        ? ["periodAmount", "yearToDateAmount"]
        : ["amount", "comparisonAmount"];
    const totals =
      kind === "income-statement"
        ? ["periodTotal", "yearToDateTotal"]
        : ["total", "comparisonTotal"];
    header(
      "Grupp",
      "Konto",
      "Namn",
      kind === "income-statement" ? "Period" : "Belopp",
      kind === "income-statement" ? "Ackumulerat" : "Jämförelse"
    );
    for (const group of array(data.groups)) {
      for (const account of array(group.accounts))
        emit(account, ["number", "name", ...fields], fields, [text(group.label)]);
      emit(group, totals, totals, [text(group.label), "", "Summa"]);
    }
  } else if (kind === "vat") {
    header("VAT-kod", "Namn", "Typ", "Sats", "Underlag", "Ingående", "Utgående");
    for (const code of array(data.codes))
      emit(
        code,
        ["code", "name", "type", "rate", "taxableBase", "inputAmount", "outputAmount"],
        ["rate", "taxableBase", "inputAmount", "outputAmount"]
      );
    header("Ruta", "Namn", "Belopp");
    for (const box of array(object(data.swedishReturn).boxes))
      emit(box, ["box", "name", "amount"], ["amount"]);
    header("Anomalikod", "Konto", "Verifikation", "Meddelande");
    for (const anomaly of array(data.anomalies))
      emit(anomaly, ["code", "account", "voucher", "message"], []);
    rows.push([
      textCell("Konfigurationsversion"),
      textCell(text(object(data.swedishReturn).configurationVersion))
    ]);
    for (const warning of (object(data.swedishReturn).warnings as unknown[]) ?? [])
      rows.push([textCell("VARNING"), textCell(text(warning))]);
  } else throw new Error("Rapporttypen saknar CSV-kontrakt.");
  header("Total", "Belopp");
  for (const [key, value] of Object.entries(object(data.totals)).sort(([a], [b]) =>
    a.localeCompare(b)
  ))
    if (typeof value === "string") rows.push([textCell(key), decimalCell(value)]);
  return encodeCsv(rows);
}
export function downloadReportCsv(
  report: unknown,
  url: string,
  org: { name: string; organizationNumber?: string | null }
) {
  const csv = reportCsv(report, url, org),
    href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = `${new URL(url, "https://local.invalid").pathname.split("/").at(-1)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}

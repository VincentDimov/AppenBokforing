import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  parseSie4,
  encodeSieBytes,
  decodeSieBytes,
  exportSie4Bytes,
  moneyCents
} from "../dist/index.js";
const header = "#SIETYP 4\n#FORMAT PC8\n#RAR 0 20260101 20261231\n";
test("reads the short official SIE 4B record examples without misclassifying reserved dimensions", () => {
  const sample = readFileSync(new URL("./fixtures/official-records.sie", import.meta.url));
  assert.deepEqual(parseSie4(sample).errors, []);
  assert.deepEqual(parseSie4(sample).warnings, []);
});
const voucher = (a = "0.01", b = "-0.01") =>
  `#VER "A" 7 20260110 "ÅÄÖ åäö \\"citat\\""\n{\n#TRANS 1930 {} ${a} 20260109 "Rad"\n#TRANS 3010 {} ${b}\n}\n`;
test("CP437 uses actual Swedish bytes, not UTF-8 and rejects lossy text", () => {
  const text = "ÅÄÖåäö";
  assert.deepEqual([...encodeSieBytes(text)], [143, 142, 153, 134, 132, 148]);
  assert.equal(decodeSieBytes(encodeSieBytes(text)), text);
  assert.throws(() => encodeSieBytes("😀"));
  assert.equal(decodeSieBytes(Uint8Array.from({ length: 128 }, (_, i) => i + 128)).length, 128);
});
test("large amounts and one cent are exact", () => {
  for (const value of ["0.01", "9999999999999999.99", "-0.01"])
    assert.equal(
      parseSie4(header + voucher(value, value.startsWith("-") ? value.slice(1) : "-" + value))
        .errors.length,
      0
    );
  assert.equal(moneyCents("9999999999999999.99"), 999999999999999999n);
  assert.ok(
    parseSie4(header + voucher("9999999999999999.99", "-9999999999999999.98")).errors.length
  );
});
test("invalid dates, unsupported accounting records and identities block confirmation", () => {
  for (const tag of ["#RTRANS", "#BTRANS", "#OIB", "#KSUMMA", "#PSALDO", "#UNDERDIM"])
    assert.ok(parseSie4(header + tag + " 0\n").errors.length);
  for (const bad of ["20260230", "20261301", "20250101"])
    assert.ok(parseSie4(header + voucher().replaceAll("20260110", bad)).errors.length);
  assert.ok(parseSie4(header + voucher().replace('"A" 7', '"A" ABC')).errors.length);
  assert.ok(parseSie4(header + "#RAR -1 20250101 20251231\n#IB -1 1930 5\n").errors.length);
  assert.equal(parseSie4(header + "#RAR -1 20250101 20251231\n").fiscalYear.start, "2026-01-01");
});
test("IB and declared closing balances are reconciled", () => {
  assert.ok(parseSie4(header + "#IB 0 1930 1\n").errors.length);
  assert.ok(parseSie4(header + voucher() + "#UB 0 1930 0.02\n").errors.length);
  assert.equal(parseSie4(header + voucher() + "#UB 0 1930 0.01\n").errors.length, 0);
});
test("export roundtrips Swedish text, quoted text, line dates and dimensions", () => {
  const bytes = exportSie4Bytes({
    organization: { name: 'ÅÄÖ "företag"' },
    fiscalYear: { start: "2026-01-01", end: "2026-12-31" },
    accounts: [
      { number: "1930", name: "Bank", type: "T" },
      { number: "3010", name: "Intäkt", type: "I" }
    ],
    balances: [
      { account: "1930", opening: "0.00", closing: "0.01" },
      { account: "3010", opening: "0.00", closing: "-0.01" }
    ],
    objects: [
      { dimension: "1", id: "K1", name: "Öst" },
      { dimension: "6", id: "P1", name: "Åsen" }
    ],
    vouchers: [
      {
        series: "A",
        number: "7",
        date: "2026-01-10",
        text: 'En "citerad" åäö',
        transactions: [
          {
            account: "1930",
            amount: "0.01",
            date: "2026-01-09",
            text: 'Rad "ett"',
            objects: [
              { dimension: "1", object: "K1" },
              { dimension: "6", object: "P1" }
            ]
          },
          { account: "3010", amount: "-0.01", objects: [] }
        ]
      }
    ]
  });
  const d = parseSie4(bytes);
  assert.deepEqual(d.errors, []);
  assert.equal(d.organization.name, 'ÅÄÖ "företag"');
  assert.equal(d.vouchers[0].transactions[0].date, "2026-01-09");
  assert.equal(d.vouchers[0].transactions[0].objects.length, 2);
});
test("serializer rejects record/control-character injection", () => {
  const data = {
    organization: { name: 'Ett\n#VER "A" 9' },
    fiscalYear: { start: "2026-01-01", end: "2026-12-31" },
    accounts: [],
    balances: [],
    vouchers: []
  };
  assert.throws(() => exportSie4Bytes(data), /Control characters/);
});

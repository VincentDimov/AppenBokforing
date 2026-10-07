import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateIndependent } from "../../../tests/sie-independent.cjs";
import { parseSie4, exportSie4Bytes } from "../dist/index.js";
const escaped = readFileSync(
  new URL("../../../tests/fixtures/sie-spec-derived.pc8-escaped.txt", import.meta.url),
  "ascii"
);
// Explicit literal byte escapes, not LedgerApp's production encoder.
const bytes = Buffer.from(
  escaped.replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
  "latin1"
);
test("independent manual PC8 fixture has known signs, balances, dimensions and line dates", () => {
  const result = validateIndependent(bytes);
  assert.match(result.text, /ÅÄÖ åäö AB/);
  assert.equal(result.closing.get("1930"), 101001n);
  assert.equal(result.vouchers[0].lines[0].date, "20260111");
  assert.equal(result.vouchers[0].lines[1].amount, -1n);
  assert.deepEqual(parseSie4(bytes).errors, []);
});
test("independent validator rejects incorrect exported closing amount", () => {
  assert.throws(
    () =>
      validateIndependent(
        Buffer.from(bytes.toString("latin1").replace("1010.01", "1010.02"), "latin1")
      ),
    /Incorrect declared balance/
  );
});
test("declared PC8 rejects UTF8 Swedish multibytes", () => {
  assert.throws(
    () => validateIndependent(Buffer.from(escaped.replaceAll(/\\x[0-9a-f]{2}/gi, "Å"), "utf8")),
    /PC8 byte/
  );
});
test("actual exporter bytes pass independent reader and literal six Swedish byte assertions", () => {
  const output = exportSie4Bytes({
    generatedDate: "2026-01-31",
    organization: { name: "ÅÄÖ åäö AB" },
    fiscalYear: { start: "2026-01-01", end: "2026-12-31" },
    accounts: [
      { number: "1930", name: "Bank", type: "T" },
      { number: "2080", name: "Kapital", type: "S" }
    ],
    balances: [
      { account: "1930", opening: "1000.00", closing: "1000.00" },
      { account: "2080", opening: "-1000.00", closing: "-1000.00" }
    ],
    vouchers: []
  });
  validateIndependent(output);
  assert.ok(Buffer.from(output).includes(Buffer.from([0x8f, 0x8e, 0x99, 0x20, 0x86, 0x84, 0x94])));
  for (const utf8 of ["Å", "Ä", "Ö", "å", "ä", "ö"])
    assert.ok(!Buffer.from(output).includes(Buffer.from(utf8, "utf8")));
});

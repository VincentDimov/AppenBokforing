import assert from "node:assert/strict";
import test from "node:test";
import { exportSie4, parseSie4 } from "../dist/index.js";

test("parses a balanced SIE4 voucher preview", () => {
  const document = parseSie4(
    `#SIETYP 4\n#RAR 0 20260101 20261231\n#KONTO 1910 "Kassa"\n#VER "A" 1 20260110 "Test"\n{\n#TRANS 1910 {} 100.00\n#TRANS 3001 {} -100.00\n}\n`
  );
  assert.equal(document.errors.length, 0);
  assert.equal(document.accounts.length, 1);
  assert.equal(document.vouchers.length, 1);
});
test("exports SIE4 records and parser rejects an unbalanced voucher", () => {
  const output = exportSie4({
    organization: { name: "Demo AB", number: "556000-0000" },
    fiscalYear: { start: "2026-01-01", end: "2026-12-31" },
    accounts: [{ number: "1910", name: "Kassa" }],
    balances: [{ account: "1910", opening: "0.00", closing: "100.00" }],
    vouchers: [
      {
        series: "A",
        number: "1",
        date: "2026-01-10",
        text: "Test",
        transactions: [
          { account: "1910", amount: "100.00", objects: [] },
          { account: "3001", amount: "-100.00", objects: [] }
        ]
      }
    ]
  });
  assert.match(output, /#SIETYP 4/);
  assert.match(output, /#VER "A" 1 20260110/);
  assert.ok(
    parseSie4(`#SIETYP 4\n#VER "A" 1 20260110 "Bad"\n{\n#TRANS 1910 {} 1.00\n}\n`).errors.length > 0
  );
});

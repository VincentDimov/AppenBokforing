/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Test-only, independently implemented SIE 4B subset validator. No production imports.
const assert = require("node:assert/strict");
const swedish = { 0x8f: "Å", 0x8e: "Ä", 0x99: "Ö", 0x86: "å", 0x84: "ä", 0x94: "ö" };
function validateIndependent(bytes) {
  const text = Array.from(bytes, (byte) => {
    assert.ok(byte < 128 || swedish[byte], "Unsupported PC8 byte in minimal independent reader");
    return byte < 128 ? String.fromCharCode(byte) : swedish[byte];
  }).join("");
  const rows = text.trim().split(/\r?\n/);
  const tokens = (row) => {
    const fields = row.match(/"(?:\\"|[^"\\])*"|[{}]|[^\s{}"]+/g) || [];
    assert.equal(fields.join("").replace(/\s/g, ""), row.replace(/\s/g, ""), "Malformed tokens");
    return fields.map((field) =>
      field.startsWith('"') ? field.slice(1, -1).replaceAll('\\"', '"') : field
    );
  };
  const cents = (value) => {
    assert.match(value, /^-?\d+(?:\.\d{1,2})?$/);
    const [whole, fraction = ""] = value.replace("-", "").split(".");
    return (
      (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) * (value.startsWith("-") ? -1n : 1n)
    );
  };
  const date = (value) => {
    assert.match(value, /^\d{8}$/);
    assert.equal(
      new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}T00:00:00Z`)
        .toISOString()
        .slice(0, 10)
        .replaceAll("-", ""),
      value
    );
    return value;
  };
  const accounts = new Map(),
    opening = new Map(),
    closing = new Map(),
    declared = new Map();
  const dimensions = new Set(),
    objects = new Set(),
    identities = new Set(),
    vouchers = [];
  let fiscal,
    current,
    block = false;
  const headers = new Set();
  for (const row of rows) {
    if (!row.trim()) continue;
    const t = tokens(row.trim());
    const [tag, a, b, c] = t;
    headers.add(tag);
    switch (tag) {
      case "#FORMAT":
        assert.equal(a, "PC8");
        break;
      case "#SIETYP":
        assert.equal(a, "4");
        break;
      case "#FLAGGA":
        assert.equal(a, "0");
        break;
      case "#GEN":
        date(a);
        break;
      case "#PROGRAM":
      case "#FNAMN":
      case "#ORGNR":
        break;
      case "#RAR":
        assert.equal(a, "0");
        fiscal = [date(b), date(c)];
        assert.ok(b <= c);
        break;
      case "#KONTO":
        assert.match(a, /^\d{4,10}$/);
        assert.ok(!accounts.has(a));
        accounts.set(a, { name: b });
        break;
      case "#KTYP":
        assert.ok(accounts.has(a));
        assert.match(b, /^[TSIK]$/);
        accounts.get(a).type = b;
        break;
      case "#IB":
      case "#UB":
      case "#RES": {
        assert.equal(a, "0");
        assert.ok(accounts.has(b));
        const map = tag === "#IB" ? opening : declared;
        assert.ok(!map.has(b));
        map.set(b, cents(c));
        break;
      }
      case "#DIM":
        assert.ok(!dimensions.has(a));
        dimensions.add(a);
        break;
      case "#OBJEKT":
        assert.ok(dimensions.has(a));
        assert.ok(!objects.has(`${a}/${b}`));
        objects.add(`${a}/${b}`);
        break;
      case "#VER": {
        assert.ok(!current && !block && fiscal);
        assert.match(b, /^[1-9]\d*$/);
        assert.ok(!identities.has(`${a}/${b}`));
        identities.add(`${a}/${b}`);
        date(c);
        assert.ok(c >= fiscal[0] && c <= fiscal[1]);
        current = { series: a, number: b, date: c, lines: [] };
        vouchers.push(current);
        break;
      }
      case "{":
        assert.ok(current && !block);
        block = true;
        break;
      case "}":
        assert.ok(current && block);
        assert.ok(current.lines.filter((line) => line.amount !== 0n).length >= 2);
        assert.equal(
          current.lines.reduce((sum, line) => sum + line.amount, 0n),
          0n
        );
        current = undefined;
        block = false;
        break;
      case "#TRANS": {
        assert.ok(current && block && accounts.has(a));
        assert.equal(b, "{");
        const end = t.indexOf("}");
        assert.ok(end >= 3 && (end - 3) % 2 === 0);
        for (let i = 3; i < end; i += 2) assert.ok(objects.has(`${t[i]}/${t[i + 1]}`));
        const lineDate = t[end + 2];
        if (lineDate) {
          date(lineDate);
          assert.ok(lineDate >= fiscal[0] && lineDate <= fiscal[1]);
        }
        current.lines.push({
          account: a,
          amount: cents(t[end + 1]),
          date: lineDate || current.date
        });
        break;
      }
      default:
        assert.fail(`Unsupported record in independent subset: ${tag}`);
    }
  }
  for (const tag of ["#FORMAT", "#SIETYP", "#FLAGGA", "#PROGRAM", "#GEN", "#FNAMN", "#RAR"])
    assert.ok(headers.has(tag), `Missing ${tag}`);
  assert.ok(!current && !block);
  assert.equal(
    [...opening.values()].reduce((sum, n) => sum + n, 0n),
    0n
  );
  for (const [account, amount] of opening) closing.set(account, amount);
  for (const voucher of vouchers)
    for (const line of voucher.lines)
      closing.set(line.account, (closing.get(line.account) || 0n) + line.amount);
  for (const [account, amount] of declared)
    assert.equal(closing.get(account) || 0n, amount, `Incorrect declared balance ${account}`);
  assert.equal(
    declared.size,
    accounts.size,
    "Every exported account needs a closing/result balance"
  );
  return { text, accounts, opening, closing, vouchers };
}
module.exports = { validateIndependent };

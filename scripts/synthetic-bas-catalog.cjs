/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Original large fixture, NOT the official BAS dataset or professional rules.
const { randomUUID } = require("node:crypto");
const economics = [
  ["ASSET", "DEBIT"],
  ["EQUITY", "CREDIT"],
  ["REVENUE", "CREDIT"],
  ["EXPENSE", "DEBIT"],
  ["EXPENSE", "DEBIT"],
  ["EXPENSE", "DEBIT"],
  ["EXPENSE", "DEBIT"],
  ["REVENUE", "CREDIT"]
];
function syntheticCatalog(version = "SYNTHETIC-SCALE-" + randomUUID()) {
  const accounts = [];
  for (let c = 1; c <= 8; c++)
    for (let i = 0; i < 164; i++) {
      const number = String(c * 1000 + 100 + i);
      if (["3210", "3230"].includes(number)) continue;
      const category = number.endsWith("00")
        ? "GROUP_ACCOUNT"
        : number.endsWith("0")
          ? "MAIN_ACCOUNT"
          : "SUBACCOUNT";
      const [type, normalBalance] = economics[c - 1];
      accounts.push({
        number,
        officialName:
          `Syntetiskt konto ${number} Åäö — ${"långt syntetiskt namn ".repeat(number === "1110" ? 8 : 0)}`.trim(),
        className: `Syntetisk klass ${c}`,
        groupName: `Syntetisk grupp ${number.slice(0, 2)}`,
        category,
        parentAccountNumber:
          category !== "SUBACCOUNT"
            ? null
            : ["321", "323"].includes(number.slice(0, 3))
              ? "3200"
              : number.slice(0, 3) + "0",
        isK2Restricted: i === 10 || i === 11,
        isBookable: ![20, 21].includes(i),
        type: c === 2 && i >= 100 ? "LIABILITY" : c === 8 && i % 2 ? "EXPENSE" : type,
        normalBalance: number === "1110" ? "CREDIT" : c === 8 && i % 2 ? "DEBIT" : normalBalance,
        classificationReference:
          "Manually specified original synthetic expectations; NOT official approval",
        sourcePosition: `Synthetic fixture ${c}:${i}`
      });
    }
  return {
    version,
    sourceVersion: "synthetic-only-v2",
    sourceReference: "synthetic://original-not-bas",
    sourceSha256: "a".repeat(64),
    licenseReference: "Original synthetic fixture; no BAS source data",
    classificationReviewReference: "Original synthetic expectations only",
    expectedAccounts: accounts.length,
    rightsConfirmed: true,
    verification: {
      allSourceEntriesReviewed: true,
      unresolvedClassifications: 0,
      unresolvedNames: 0,
      unresolvedDuplicates: 0
    },
    accounts
  };
}
function databaseRows(manifest, catalogVersionId) {
  return manifest.accounts.map((r) => ({
    id: randomUUID(),
    catalogVersionId,
    accountNumber: r.number,
    officialName: r.officialName,
    accountClass: r.number[0],
    accountGroup: r.number.slice(0, 2),
    className: r.className,
    groupName: r.groupName,
    category: r.category,
    parentAccountNumber: r.parentAccountNumber,
    isK2Restricted: r.isK2Restricted,
    isBookable: r.isBookable,
    isDefaultActive: r.isBookable && !r.isK2Restricted && r.number.endsWith("0"),
    type: r.type,
    normalBalance: r.normalBalance,
    classificationReference: r.classificationReference,
    sourcePosition: r.sourcePosition
  }));
}
module.exports = { syntheticCatalog, databaseRows };

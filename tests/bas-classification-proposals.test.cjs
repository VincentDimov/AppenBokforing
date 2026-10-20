"use strict";
/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  financialProposal,
  proposeCatalog
} = require("../scripts/bas-classification-proposals.cjs");

function sourceRow(number, name, extra = {}) {
  return {
    number,
    officialName: name,
    sourceNameVariants: [name],
    className: null,
    groupName: "Original synthetic source group",
    type: null,
    normalBalance: null,
    parentAccountNumber: null,
    isBookable: null,
    classificationReference: null,
    isK2Restricted: false,
    reviewStatus: "REQUIRED",
    ...extra
  };
}
function raw(accounts) {
  return {
    mode: "REVIEW_REQUIRED_NOT_IMPORTABLE",
    expectedAccounts: accounts.length,
    rightsConfirmed: true,
    licenseReference: "Synthetic rights fixture, not an official license",
    verification: { allSourceEntriesReviewed: false, unresolvedNames: 0, unresolvedDuplicates: 0 },
    accounts
  };
}
test("baseline puts classes 1–2 on balance sheet and 3–8 on income statement", () => {
  const result = proposeCatalog(
    raw(
      ["1000", "2000", "3000", "4000", "5000", "6000", "7000", "8000"].map((n) =>
        sourceRow(n, "Original synthetic account")
      )
    )
  );
  assert.deepEqual(
    result.accounts.map((r) => r.classificationProposal.reportType),
    ["BALANCE_SHEET", "BALANCE_SHEET", ...Array(6).fill("INCOME_STATEMENT")]
  );
  assert.deepEqual(
    result.accounts.slice(0, 7).map((r) => r.type),
    ["ASSET", "EQUITY", "REVENUE", "EXPENSE", "EXPENSE", "EXPENSE", "EXPENSE"]
  );
  assert.equal(result.accounts[7].type, null);
});
test("class 2 separates equity and liabilities, including input VAT contra side", () => {
  assert.equal(financialProposal("2081", "Synthetic capital").type, "EQUITY");
  assert.equal(financialProposal("2440", "Synthetic payable").type, "LIABILITY");
  assert.equal(financialProposal("2641", "Synthetic input tax").normalBalance, "DEBIT");
  assert.equal(financialProposal("2611", "Synthetic output tax").normalBalance, "CREDIT");
  assert.equal(financialProposal("2013", "Övriga egna uttag, synthetic").normalBalance, "DEBIT");
});
test("contra asset is still an asset, while a doubtful receivable is not an allowance", () => {
  assert.deepEqual(financialProposal("1229", "Ackumulerade avskrivningar, synthetic"), {
    type: "ASSET",
    normalBalance: "CREDIT",
    rule: "ASSET_WITH_EXPLICIT_ALLOWANCE_EXCEPTION"
  });
  assert.equal(
    financialProposal("1519", "Nedskrivning av synthetic receivables").normalBalance,
    "CREDIT"
  );
  assert.equal(financialProposal("1525", "Osäkra synthetic receivables").normalBalance, "DEBIT");
});
test("class 8 differentiates income, expenses and expense reversal", () => {
  assert.equal(financialProposal("8310", "Ränteintäkter synthetic").type, "REVENUE");
  assert.equal(financialProposal("8410", "Räntekostnader synthetic").type, "EXPENSE");
  assert.equal(financialProposal("8070", "Nedskrivningar synthetic").type, "EXPENSE");
  const reversal = financialProposal("8080", "Återföringar av nedskrivningar synthetic");
  assert.equal(reversal.type, "EXPENSE");
  assert.equal(reversal.normalBalance, "CREDIT");
});
test("result-transfer accounts and unknown labels are not forced into an economic type", () => {
  for (const [n, name] of [
    ["8990", "Resultat synthetic"],
    ["8999", "Årets resultat synthetic"],
    ["8000", "Unknown synthetic financial semantics"]
  ]) {
    assert.equal(financialProposal(n, name).type, null);
    assert.equal(financialProposal(n, name).normalBalance, null);
  }
});
test("net presentation proposals are explicit conventions, not sign-based reclassifications", () => {
  for (const [n, name, type] of [
    ["8020", "Resultat vid försäljning, synthetic", "REVENUE"],
    ["8290", "Värdering till verkligt värde, synthetic", "REVENUE"],
    ["8430", "Valutakursdifferenser synthetic", "EXPENSE"],
    ["8850", "Förändring av överavskrivningar synthetic", "EXPENSE"],
    ["8940", "Uppskjuten skatt synthetic", "EXPENSE"]
  ]) {
    const p = financialProposal(n, name);
    assert.equal(p.type, type);
    assert.match(p.rule, /^PROPOSED_NET_/u);
  }
});
test("discount contra sides do not change economic account type", () => {
  const sale = financialProposal("3730", "Lämnade rabatter synthetic");
  assert.equal(sale.type, "REVENUE");
  assert.equal(sale.normalBalance, "DEBIT");
  const purchase = financialProposal("4730", "Erhållna rabatter synthetic");
  assert.equal(purchase.type, "EXPENSE");
  assert.equal(purchase.normalBalance, "CREDIT");
});
test("parents are existing identities, not invented main accounts", () => {
  const result = proposeCatalog(
    raw([sourceRow("3200", "Original group account"), sourceRow("3211", "Original subaccount")])
  );
  assert.equal(result.accounts[1].parentAccountNumber, "3200");
  assert.deepEqual(result.accounts[1].classificationProposal.specialDecisions, [
    "EXPLICIT_GROUP_PARENT_REVIEW_REQUIRED"
  ]);
  assert.equal(result.accounts[0].isBookable, true);
});
test("missing source group label uses actual group account, preserving source names", () => {
  const data = raw([
    sourceRow("3100", "Original group label", { groupName: null }),
    sourceRow("3105", "Original sub label", { groupName: null })
  ]);
  const before = JSON.stringify(data);
  const result = proposeCatalog(data);
  assert.equal(result.accounts[1].groupName, "Original group label");
  assert.equal(result.accounts[1].officialName, "Original sub label");
  assert.equal(JSON.stringify(data), before);
});
test("name conflict and K2 uncertainty remain explicit, not last row wins", () => {
  const result = proposeCatalog(
    raw([
      sourceRow("2087", null, {
        sourceNameVariants: ["First synthetic variant", "Second synthetic variant"],
        isK2Restricted: null
      })
    ])
  );
  assert.equal(result.accounts[0].officialName, null);
  assert.equal(result.accounts[0].type, "EQUITY");
  assert.equal(result.accounts[0].isK2Restricted, null);
  assert.ok(
    result.accounts[0].classificationProposal.specialDecisions.includes(
      "SOURCE_NAME_DECISION_REQUIRED"
    )
  );
});
test("different economic semantics among name variants never select the last one", () => {
  const result = proposeCatalog(
    raw([
      sourceRow("1220", null, {
        sourceNameVariants: ["Synthetic equipment", "Ackumulerade avskrivningar, synthetic"]
      })
    ])
  );
  assert.equal(result.accounts[0].type, null);
  assert.equal(result.accounts[0].normalBalance, null);
  assert.ok(
    result.accounts[0].classificationProposal.specialDecisions.includes(
      "SOURCE_VARIANT_CLASSIFICATION_CONFLICT"
    )
  );
});
test("proposals never manufacture rights, review approval, VAT or a valid import", () => {
  const data = raw([sourceRow("1930", "Original synthetic bank")]);
  data.rightsConfirmed = false;
  data.licenseReference = null;
  const result = proposeCatalog(data);
  assert.equal(result.rightsConfirmed, false);
  assert.equal(result.licenseReference, null);
  assert.equal(result.verification.allSourceEntriesReviewed, false);
  assert.equal(result.verification.unresolvedClassifications, 1);
  assert.equal(result.classificationReviewReference, null);
  assert.equal(result.proposalSummary.independentApprovalsGranted, 0);
  assert.equal(result.proposalSummary.databaseMutations, 0);
  assert.equal(result.accounts[0].reviewStatus, "PROPOSED_NOT_APPROVED");
  assert.equal("vatCode" in result.accounts[0], false);
});
test("invalid identity, duplicates, unbounded data and preexisting reviews fail closed", () => {
  for (const data of [
    raw([]),
    raw([sourceRow("9999", "Synthetic")]),
    raw([sourceRow("1930", "A"), sourceRow("1930", "B")]),
    raw([sourceRow("1930", "A", { type: "ASSET" })]),
    raw([sourceRow("1930", "A", { reviewStatus: "APPROVED" })]),
    { ...raw([sourceRow("1930", "A")]), expectedAccounts: 2 }
  ]) {
    assert.throws(() => proposeCatalog(data));
  }
  assert.throws(() => proposeCatalog(raw(Array(10001).fill(sourceRow("1930", "A")))));
});

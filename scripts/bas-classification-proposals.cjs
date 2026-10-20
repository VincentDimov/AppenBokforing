"use strict";
/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Offline proposals only. Not used by posting, startup, seed or migrations.
const RULE_VERSION = "ledgerapp-bas-proposals-2026-10-19-v2";
const SOURCE = "https://www.bas.se/kontoplaner/kontoplanens-uppbyggnad-och-anvandning/";
const CLASS_NAMES = Object.freeze({
  1: "Tillgångar",
  2: "Eget kapital och skulder",
  3: "Rörelsens intäkter",
  4: "Varu- och materialkostnader",
  5: "Övriga externa rörelsekostnader",
  6: "Övriga externa rörelsekostnader",
  7: "Personalkostnader och avskrivningar",
  8: "Finansiella poster och skatter"
});

function financialProposal(number, name) {
  const n = name.toLocaleLowerCase("sv-SE");
  const result = (type, normalBalance, rule) => ({ type, normalBalance, rule });
  switch (number[0]) {
    case "1":
      // A credit-side allowance remains an ASSET, not a liability. Doubtful
      // receivables themselves are not allowances just because they are doubtful.
      return result(
        "ASSET",
        /^(ackumulerade (avskrivningar|nedskrivningar)|nedskrivning av)/u.test(n)
          ? "CREDIT"
          : "DEBIT",
        "ASSET_WITH_EXPLICIT_ALLOWANCE_EXCEPTION"
      );
    case "2": {
      const equity = number.startsWith("20");
      const debit =
        number.startsWith("264") ||
        (equity && /^(egna varuuttag|övriga egna uttag|egna aktier)/u.test(n));
      return result(
        equity ? "EQUITY" : "LIABILITY",
        debit ? "DEBIT" : "CREDIT",
        equity ? "EQUITY_WITH_WITHDRAWAL_EXCEPTION" : "LIABILITY_WITH_INPUT_VAT_EXCEPTION"
      );
    }
    case "3":
      return result(
        "REVENUE",
        /^lämnade .*rabatter|^lämnade rabatter/u.test(n) ? "DEBIT" : "CREDIT",
        "OPERATING_REVENUE_WITH_DISCOUNT_EXCEPTION"
      );
    case "4":
    case "5":
    case "6":
    case "7":
      return result(
        "EXPENSE",
        /^erhållna .*rabatter|^erhållna rabatter/u.test(n) ? "CREDIT" : "DEBIT",
        "OPERATING_EXPENSE_WITH_DISCOUNT_EXCEPTION"
      );
    case "8":
      // Class 8 is NOT uniformly expense or revenue. A label describing a
      // net result/value change does not establish its side or presentation.
      if (
        /^(ränteintäkter|övriga ränteintäkter|skattefria ränteintäkter|utdelning|emissionsinsats|insatsemission|valutakursvinster|övriga finansiella intäkter)/u.test(
          n
        )
      )
        return result("REVENUE", "CREDIT", "EXPLICIT_FINANCIAL_INCOME_LABEL");
      if (
        /^(räntekostnader|övriga räntekostnader|räntedel|dröjsmålsräntor|nedskrivningar|valutakursförluster|avkastningsskatt|skatt som belastar|övriga skatter|avsättning till|lämnade koncernbidrag|lämnade gottgörelser)/u.test(
          n
        )
      )
        return result("EXPENSE", "DEBIT", "EXPLICIT_FINANCIAL_EXPENSE_LABEL");
      if (
        /^(återföringar av nedskrivningar|återföring från|ianspråktagande av ersättningsfond|restituerad skatt|avdragspost för räntesubventioner|erhållna räntebidrag|aktiverade ränteutgifter)/u.test(
          n
        )
      )
        return result("EXPENSE", "CREDIT", "PROPOSED_CONTRA_FINANCIAL_EXPENSE");
      if (/^(mottagna koncernbidrag|erhållet ackord)/u.test(n))
        return result("REVENUE", "CREDIT", "PROPOSED_RECEIVED_APPROPRIATION_OR_DEBT_GAIN");
      // Explicit proposed presentation conventions, NOT a claim that a net
      // account is always positive. Losses may be negative financial income;
      // a reversal may be a negative appropriation/tax expense. Reviewer must
      // approve this convention, not reclassify historical accounts by sign.
      if (
        /^(80|81|82|83)/u.test(number) &&
        /^(resultat vid försäljning|resultatandelar|valutakursdifferenser|värdering till verkligt värde|orealiserade värdeförändringar)/u.test(
          n
        )
      )
        return result("REVENUE", "CREDIT", "PROPOSED_NET_FINANCIAL_INCOME_PRESENTATION");
      if (
        number.startsWith("84") &&
        /^(valutakursdifferenser|orealiserade värdeförändringar|övriga skuldrelaterade poster)/u.test(
          n
        )
      )
        return result("EXPENSE", "DEBIT", "PROPOSED_NET_FINANCING_COST_PRESENTATION");
      if (number.startsWith("88") && /^(förändring av|övriga bokslutsdispositioner)/u.test(n))
        return result("EXPENSE", "DEBIT", "PROPOSED_NET_APPROPRIATION_PRESENTATION");
      if (number.startsWith("89") && /^(skatt på grund av|uppskjuten skatt)/u.test(n))
        return result("EXPENSE", "DEBIT", "PROPOSED_NET_TAX_EXPENSE_PRESENTATION");
      // Result-transfer/closing accounts are deliberately not treated as
      // ordinary expense, revenue or equity solely to satisfy an enum.
      return result(null, null, "MANUAL_NET_TAX_OR_RESULT_ACCOUNT_DECISION_REQUIRED");
    default:
      throw new Error("Unsupported source account class.");
  }
}

function proposeCatalog(input) {
  if (
    !input ||
    input.mode !== "REVIEW_REQUIRED_NOT_IMPORTABLE" ||
    !Array.isArray(input.accounts) ||
    input.accounts.length < 1 ||
    input.accounts.length > 10000 ||
    input.accounts.length !== input.expectedAccounts
  )
    throw new Error("A bounded raw preparation file is required.");
  const byNumber = new Map();
  for (const row of input.accounts) {
    if (
      !row ||
      !/^[1-8]\d{3}$/u.test(row.number) ||
      byNumber.has(row.number) ||
      !Array.isArray(row.sourceNameVariants) ||
      !row.sourceNameVariants.length ||
      row.sourceNameVariants.some((n) => typeof n !== "string" || !n.trim() || n.length > 2000)
    )
      throw new Error("Invalid source identity or source variants.");
    // Never overwrite human decisions, prior proposals or an approval.
    if (
      row.type !== null ||
      row.normalBalance !== null ||
      row.isBookable !== null ||
      row.classificationReference !== null ||
      row.parentAccountNumber !== null ||
      row.reviewStatus !== "REQUIRED"
    )
      throw new Error("Refusing to overwrite existing classifications or review decisions.");
    byNumber.set(row.number, row);
  }
  const accounts = input.accounts.map((row) => {
    const reasons = [];
    const name = row.officialName;
    if (typeof name !== "string" || !row.sourceNameVariants.includes(name))
      reasons.push("SOURCE_NAME_DECISION_REQUIRED");
    const variantProposals = row.sourceNameVariants.map((n) => financialProposal(row.number, n));
    const firstProposal = variantProposals[0];
    const p = variantProposals.every(
      (v) => v.type === firstProposal.type && v.normalBalance === firstProposal.normalBalance
    )
      ? firstProposal
      : { type: null, normalBalance: null, rule: "SOURCE_VARIANT_CLASSIFICATION_CONFLICT" };
    if (!p.type && !reasons.includes(p.rule)) reasons.push(p.rule);
    const category = row.number.endsWith("00")
      ? "GROUP_ACCOUNT"
      : row.number.endsWith("0")
        ? "MAIN_ACCOUNT"
        : "SUBACCOUNT";
    let parent = null;
    if (category === "SUBACCOUNT") {
      const candidates = [row.number.slice(0, 3) + "0", row.number.slice(0, 2) + "00"];
      parent = candidates.find((n) => byNumber.has(n)) ?? null;
      if (!parent) reasons.push("EXISTING_PARENT_REQUIRED");
      else if (parent !== candidates[0]) reasons.push("EXPLICIT_GROUP_PARENT_REVIEW_REQUIRED");
    }
    const groupAccount = byNumber.get(row.number.slice(0, 2) + "00");
    const groupName = row.groupName ?? groupAccount?.officialName ?? null;
    if (!groupName) reasons.push("GROUP_LABEL_REQUIRED");
    if (typeof row.isK2Restricted !== "boolean") reasons.push("K2_MARKER_DECISION_REQUIRED");
    return {
      ...row,
      category,
      className: row.className ?? CLASS_NAMES[row.number[0]],
      groupName,
      parentAccountNumber: parent,
      type: p.type,
      normalBalance: p.normalBalance,
      // These are actual four-digit source accounts, not heading rows. This
      // proposal does not assert that a reviewer approved posting eligibility.
      isBookable: true,
      classificationReference: `PROPOSED ${RULE_VERSION}:${p.rule}; ${SOURCE}`,
      classificationProposal: {
        rule: p.rule,
        reportType: Number(row.number[0]) <= 2 ? "BALANCE_SHEET" : "INCOME_STATEMENT",
        classLabelOrigin: row.className ? "SOURCE" : "USER_CLASS_TABLE_2026_10_19",
        groupLabelOrigin: row.groupName ? "SOURCE" : "EXISTING_GROUP_ACCOUNT_LABEL",
        bookabilityRule: "FOUR_DIGIT_SOURCE_ACCOUNT_NOT_A_HEADING",
        requiresReviewerApproval: true,
        specialDecisions: reasons
      },
      reviewStatus: "PROPOSED_NOT_APPROVED"
    };
  });
  return {
    ...input,
    mode: "CLASSIFICATION_PROPOSALS_NOT_IMPORTABLE",
    classificationReviewReference: null,
    verification: {
      ...input.verification,
      allSourceEntriesReviewed: false,
      unresolvedClassifications: accounts.length
    },
    proposalSummary: {
      ruleVersion: RULE_VERSION,
      sourceReference: SOURCE,
      baselineReference: "User-supplied class table, 2026-10-19",
      proposedFinancialValues: accounts.filter((r) => r.type && r.normalBalance).length,
      missingFinancialValues: accounts.filter((r) => !r.type || !r.normalBalance).length,
      specialDecisionAccounts: accounts
        .filter((r) => r.classificationProposal.specialDecisions.length)
        .map((r) => ({ number: r.number, reasons: r.classificationProposal.specialDecisions })),
      independentApprovalsGranted: 0,
      databaseConnected: false,
      databaseMutations: 0
    },
    accounts
  };
}

function main() {
  const fs = require("node:fs");
  const path = require("node:path");
  const [sourceArg, outputArg, ...extra] = process.argv.slice(2);
  if (!sourceArg || !outputArg || extra.length) throw new Error("Expected source and output file.");
  const privateRoot = fs.realpathSync(path.resolve(__dirname, "../.local-artifacts"));
  const source = fs.realpathSync(path.resolve(sourceArg));
  const output = path.resolve(outputArg);
  const outputParent = fs.realpathSync(path.dirname(output));
  const contained = (p) => {
    const r = path.relative(privateRoot, p);
    return r !== "" && r !== ".." && !r.startsWith(".." + path.sep) && !path.isAbsolute(r);
  };
  if (!contained(source) || !contained(outputParent) || fs.existsSync(output))
    throw new Error("Private input/output without overwrite is required.");
  const stat = fs.statSync(source);
  if (!stat.isFile() || stat.size > 12 * 1024 * 1024) throw new Error("Invalid bounded file.");
  const result = proposeCatalog(JSON.parse(fs.readFileSync(source, "utf8")));
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(
    JSON.stringify({
      status: result.mode,
      accounts: result.accounts.length,
      ...result.proposalSummary
    })
  );
}

module.exports = { financialProposal, proposeCatalog };
if (require.main === module) {
  try {
    main();
  } catch {
    console.error("BAS proposal preparation refused; no source content or credentials are logged.");
    process.exitCode = 1;
  }
}

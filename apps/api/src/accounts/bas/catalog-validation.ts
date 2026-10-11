import { AccountType, BalanceSide, BasAccountCategory } from "@ledgerapp/db";

export interface CatalogRow {
  number: string;
  officialName: string;
  className: string;
  groupName: string;
  category: BasAccountCategory;
  parentAccountNumber: string | null;
  isK2Restricted: boolean;
  isBookable: boolean;
  type: AccountType;
  normalBalance: BalanceSide;
  classificationReference: string;
  sourcePosition: string;
}
export interface AuthorizedCatalog {
  version: string;
  sourceVersion: string;
  sourceReference: string;
  sourceSha256: string;
  licenseReference: string;
  classificationReviewReference: string;
  expectedAccounts: number;
  rightsConfirmed: true;
  verification: {
    allSourceEntriesReviewed: true;
    unresolvedClassifications: 0;
    unresolvedNames: 0;
    unresolvedDuplicates: 0;
  };
  accounts: CatalogRow[];
}
const text = (v: unknown, limit = 2000): v is string =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  v.length <= limit &&
  [...v].every((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 || code === 9 || code === 10 || code === 13;
  });
export function accountCategory(number: string): BasAccountCategory {
  return number.endsWith("00")
    ? "GROUP_ACCOUNT"
    : number.endsWith("0")
      ? "MAIN_ACCOUNT"
      : "SUBACCOUNT";
}
/** Collect ALL blockers without echoing source names, secrets or personal data. */
export function catalogBlockers(input: unknown): { code: string; row?: number }[] {
  const blockers: { code: string; row?: number }[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input))
    return [{ code: "INVALID_MANIFEST" }];
  const c = input as Partial<AuthorizedCatalog>;
  if (![c.version, c.sourceVersion].every((v) => text(v, 64)))
    blockers.push({ code: "SOURCE_VERSION_REQUIRED" });
  if (!text(c.sourceReference) || !/^[a-f0-9]{64}$/.test(c.sourceSha256 ?? ""))
    blockers.push({ code: "SOURCE_PROVENANCE_REQUIRED" });
  if (c.rightsConfirmed !== true || !text(c.licenseReference))
    blockers.push({ code: "RIGHTS_NOT_ESTABLISHED" });
  if (
    !text(c.classificationReviewReference) ||
    c.verification?.allSourceEntriesReviewed !== true ||
    c.verification?.unresolvedClassifications !== 0
  )
    blockers.push({ code: "CLASSIFICATION_REVIEW_REQUIRED" });
  if (c.verification?.unresolvedNames !== 0) blockers.push({ code: "UNRESOLVED_NAMES" });
  if (c.verification?.unresolvedDuplicates !== 0) blockers.push({ code: "UNRESOLVED_DUPLICATES" });
  const rows = Array.isArray(c.accounts) ? c.accounts : [];
  if (
    !Number.isInteger(c.expectedAccounts) ||
    (c.expectedAccounts ?? 0) < 1 ||
    (c.expectedAccounts ?? 0) > 10000 ||
    rows.length !== c.expectedAccounts ||
    rows.length > 10000
  )
    blockers.push({ code: "INCOMPLETE_OR_UNBOUNDED_CATALOG" });
  const numbers = new Set<string>();
  for (const [index, row] of rows.slice(0, 10000).entries()) {
    const fail = (code: string) => blockers.push({ code, row: index + 1 });
    if (!row || typeof row !== "object") {
      fail("INVALID_ACCOUNT");
      continue;
    }
    if (typeof row.number !== "string" || !/^[1-8]\d{3}$/.test(row.number))
      fail("INVALID_ACCOUNT_NUMBER");
    else {
      if (numbers.has(row.number)) fail("DUPLICATE_ACCOUNT_NUMBER");
      numbers.add(row.number);
      if (row.category !== accountCategory(row.number)) fail("INVALID_CATEGORY");
    }
    if (![row.officialName, row.className, row.groupName, row.sourcePosition].every((v) => text(v)))
      fail("UNVERIFIED_NAME_OR_POSITION");
    if (
      !text(row.classificationReference) ||
      !Object.values(AccountType).includes(row.type) ||
      !Object.values(BalanceSide).includes(row.normalBalance)
    )
      fail("UNVERIFIED_ACCOUNT_CLASSIFICATION");
    if (typeof row.isK2Restricted !== "boolean" || typeof row.isBookable !== "boolean")
      fail("UNVERIFIED_RESTRICTION_OR_BOOKABILITY");
  }
  for (const [index, row] of rows.slice(0, 10000).entries()) {
    if (!row || typeof row.number !== "string") continue;
    const p = row.parentAccountNumber;
    if (
      row.category === "SUBACCOUNT"
        ? typeof p !== "string" ||
          p === row.number ||
          !numbers.has(p) ||
          !p.endsWith("0") ||
          p.slice(0, 2) !== row.number.slice(0, 2)
        : p !== null
    )
      blockers.push({ code: "INVALID_REVIEWED_PARENT", row: index + 1 });
  }
  return blockers;
}
export function validateAuthorizedCatalog(input: unknown): AuthorizedCatalog {
  const blockers = catalogBlockers(input);
  if (blockers.length)
    throw new Error(`Catalog refused: ${[...new Set(blockers.map((b) => b.code))].join(", ")}`);
  if (!input || typeof input !== "object") throw new Error("Catalog must be an object.");
  const c = input as AuthorizedCatalog;
  if (
    ![c.version, c.sourceVersion].every((v) => text(v, 64)) ||
    ![c.sourceReference, c.licenseReference, c.classificationReviewReference].every((v) =>
      text(v)
    ) ||
    !/^[a-f0-9]{64}$/.test(c.sourceSha256 ?? "") ||
    c.rightsConfirmed !== true ||
    c.verification?.allSourceEntriesReviewed !== true ||
    c.verification.unresolvedClassifications !== 0 ||
    c.verification.unresolvedNames !== 0 ||
    c.verification.unresolvedDuplicates !== 0
  )
    throw new Error(
      "Verified source, rights attestation and complete classification review are required."
    );
  if (
    !Array.isArray(c.accounts) ||
    !Number.isInteger(c.expectedAccounts) ||
    c.expectedAccounts < 1 ||
    c.expectedAccounts > 10000 ||
    c.accounts.length !== c.expectedAccounts
  )
    throw new Error("Catalog is empty, incomplete, or exceeds the bounded import size.");
  const numbers = new Set<string>();
  for (const row of c.accounts) {
    if (!row || !/^[1-8]\d{3}$/.test(row.number) || numbers.has(row.number))
      throw new Error("Invalid or duplicate posting account number.");
    numbers.add(row.number);
    if (
      ![
        row.officialName,
        row.className,
        row.groupName,
        row.classificationReference,
        row.sourcePosition
      ].every((v) => text(v)) ||
      row.category !== accountCategory(row.number) ||
      typeof row.isK2Restricted !== "boolean" ||
      typeof row.isBookable !== "boolean" ||
      !Object.values(AccountType).includes(row.type) ||
      !Object.values(BalanceSide).includes(row.normalBalance)
    )
      throw new Error(
        "Unverified account name, hierarchy, restriction or accounting classification."
      );
  }
  for (const row of c.accounts) {
    if (
      row.parentAccountNumber !== null &&
      (row.category !== "SUBACCOUNT" ||
        row.parentAccountNumber === row.number ||
        !numbers.has(row.parentAccountNumber) ||
        !row.parentAccountNumber.endsWith("0") ||
        row.parentAccountNumber.slice(0, 2) !== row.number.slice(0, 2))
    )
      throw new Error("Invalid reviewed parent account relationship.");
    if (row.category === "SUBACCOUNT" && row.parentAccountNumber === null)
      throw new Error(
        "Every subaccount needs an explicitly reviewed existing parent; do not invent missing main accounts."
      );
  }
  return c;
}
export function defaultActive(row: Pick<CatalogRow, "number" | "isK2Restricted" | "isBookable">) {
  return row.isBookable && !row.isK2Restricted && row.number.endsWith("0");
}

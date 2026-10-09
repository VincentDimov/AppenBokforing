import {
  accountCategory,
  defaultActive,
  validateAuthorizedCatalog,
  type AuthorizedCatalog
} from "./catalog-validation";

const fixture = (): AuthorizedCatalog => ({
  version: "SYNTHETIC-ONLY-2026",
  sourceVersion: "test",
  sourceReference: "synthetic://not-bas",
  sourceSha256: "a".repeat(64),
  licenseReference: "Original synthetic fixture, no BAS data",
  classificationReviewReference: "Manual fixture classification",
  expectedAccounts: 4,
  rightsConfirmed: true,
  verification: {
    allSourceEntriesReviewed: true,
    unresolvedClassifications: 0,
    unresolvedNames: 0,
    unresolvedDuplicates: 0
  },
  accounts: [
    {
      number: "1100",
      officialName: "Synthetic group",
      category: "GROUP_ACCOUNT",
      parentAccountNumber: null,
      isK2Restricted: false,
      isBookable: true,
      type: "ASSET",
      normalBalance: "DEBIT"
    },
    {
      number: "1110",
      officialName: "Synthetic contra main",
      category: "MAIN_ACCOUNT",
      parentAccountNumber: null,
      isK2Restricted: false,
      isBookable: true,
      type: "ASSET",
      normalBalance: "CREDIT"
    },
    {
      number: "1111",
      officialName: "Synthetic optional",
      category: "SUBACCOUNT",
      parentAccountNumber: "1110",
      isK2Restricted: false,
      isBookable: true,
      type: "ASSET",
      normalBalance: "DEBIT"
    },
    {
      number: "8010",
      officialName: "Synthetic financial revenue",
      category: "MAIN_ACCOUNT",
      parentAccountNumber: null,
      isK2Restricted: true,
      isBookable: true,
      type: "REVENUE",
      normalBalance: "CREDIT"
    }
  ].map((row) => ({
    ...row,
    className: "Synthetic class",
    groupName: "Synthetic group",
    classificationReference: "Synthetic reviewed",
    sourcePosition: "Fixture"
  })) as AuthorizedCatalog["accounts"]
});
describe("authorized BAS catalog boundary (synthetic data only)", () => {
  it("retains explicit economic class and contra normal side without digit guesses", () => {
    const c = validateAuthorizedCatalog(fixture());
    expect(c.accounts[1]!.normalBalance).toBe("CREDIT");
    expect(c.accounts[3]!.type).toBe("REVENUE");
  });
  it.each(["1100", "1110", "1111", "8010"])(
    "categorizes the real four-digit number %s without # suffix",
    (number) => {
      expect(accountCategory(number)).toBe(
        number.endsWith("00")
          ? "GROUP_ACCOUNT"
          : number.endsWith("0")
            ? "MAIN_ACCOUNT"
            : "SUBACCOUNT"
      );
    }
  );
  it("auto-activates only unrestricted bookable groups/mains", () => {
    expect(fixture().accounts.map(defaultActive)).toEqual([true, true, false, false]);
    expect(defaultActive({ ...fixture().accounts[0]!, isBookable: false })).toBe(false);
  });
  it.each([
    "rights",
    "classification",
    "names",
    "duplicates",
    "count",
    "marker",
    "duplicate-number",
    "missing-parent",
    "invented-parent",
    "type",
    "name",
    "category"
  ])("fails closed on unresolved %s", (failure) => {
    const c = fixture();
    if (failure === "rights")
      (c as unknown as { rightsConfirmed: boolean }).rightsConfirmed = false;
    if (failure === "classification")
      (
        c.verification as unknown as { unresolvedClassifications: number }
      ).unresolvedClassifications = 1;
    if (failure === "names")
      (c.verification as unknown as { unresolvedNames: number }).unresolvedNames = 1;
    if (failure === "duplicates")
      (c.verification as unknown as { unresolvedDuplicates: number }).unresolvedDuplicates = 1;
    if (failure === "count") c.expectedAccounts = 5;
    if (failure === "marker") c.accounts[3]!.number = "8010#";
    if (failure === "duplicate-number") c.accounts[1]!.number = "1100";
    if (failure === "missing-parent") c.accounts[2]!.parentAccountNumber = null;
    if (failure === "invented-parent") c.accounts[2]!.parentAccountNumber = "1120";
    if (failure === "type") c.accounts[3]!.type = "UNKNOWN" as never;
    if (failure === "name") c.accounts[0]!.officialName = "";
    if (failure === "category") c.accounts[0]!.category = "MAIN_ACCOUNT";
    expect(() => validateAuthorizedCatalog(c)).toThrow();
  });
  it("does not silently truncate long official labels", () => {
    const c = fixture();
    c.accounts[0]!.officialName = "Åäö ".repeat(50);
    expect(validateAuthorizedCatalog(c).accounts[0]!.officialName).toHaveLength(200);
  });
});

import { compareCatalogs } from "./catalog-diff";
import type { CatalogRow } from "./catalog-validation";

const row = (number: string): CatalogRow => ({
  number,
  officialName: "Synthetic",
  className: "Synthetic",
  groupName: "Synthetic",
  category: "MAIN_ACCOUNT",
  parentAccountNumber: null,
  isK2Restricted: false,
  isBookable: true,
  type: "ASSET",
  normalBalance: "DEBIT",
  classificationReference: "reviewed synthetic fixture",
  sourcePosition: "fixture"
});

it("previews added, removed, renamed and accounting-sensitive differences without mutations", () => {
  const before = [row("1110"), row("1120"), row("1130")];
  const snapshot = structuredClone(before);
  const after = [
    { ...row("1110"), officialName: "Renamed synthetic" },
    { ...row("1120"), normalBalance: "CREDIT" as const },
    row("1140")
  ];
  expect(compareCatalogs(before, after)).toEqual({
    added: ["1140"],
    removed: ["1130"],
    changed: [
      { number: "1110", fields: ["officialName"], requiresAccountingReview: false },
      { number: "1120", fields: ["normalBalance"], requiresAccountingReview: true }
    ]
  });
  expect(before).toEqual(snapshot);
});

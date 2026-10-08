import { describe, expect, it } from "@jest/globals";

import {
  allNavigationItems,
  dashboardNavigationItem,
  getWorkspaceNavigationItem,
  isNavigationActive,
  navigationGroups
} from "@/lib/app-navigation";

describe("application navigation", () => {
  it("marks only the most specific item and handles canonical aliases", () => {
    expect(isNavigationActive("/bookkeeping/vouchers/new", "/app/bookkeeping/vouchers/new")).toBe(
      true
    );
    expect(isNavigationActive("/bookkeeping/vouchers/new", "/app/bookkeeping/vouchers")).toBe(
      false
    );
    expect(
      isNavigationActive("/app/bookkeeping/vouchers/entry-id", "/app/bookkeeping/vouchers")
    ).toBe(true);
    expect(isNavigationActive("/reports/balance-sheet", "/app/reports/balance-sheet")).toBe(true);
  });
  it("contains every requested navigation group and entry", () => {
    expect(dashboardNavigationItem).toMatchObject({ href: "/app", label: "Översikt" });
    expect(navigationGroups.map((group) => group.label)).toEqual([
      "Bokföring",
      "Rapporter",
      "Register",
      "Inställningar"
    ]);
    expect(allNavigationItems.map((item) => item.href)).toEqual(
      expect.arrayContaining([
        "/app/bookkeeping/vouchers",
        "/app/bookkeeping/vouchers/new",
        "/app/reports/general-ledger",
        "/app/reports/vat",
        "/app/registers/cost-centers",
        "/app/settings/import-export"
      ])
    );
  });

  it("resolves placeholder routes from their catch-all slug", () => {
    expect(getWorkspaceNavigationItem(["reports", "income-statement"])?.label).toBe(
      "Resultaträkning"
    );
    expect(getWorkspaceNavigationItem(["unknown"])).toBeUndefined();
  });
});

import { describe, expect, it } from "@jest/globals";

import {
  allNavigationItems,
  dashboardNavigationItem,
  getWorkspaceNavigationItem,
  navigationGroups
} from "@/lib/app-navigation";

describe("application navigation", () => {
  it("contains every requested navigation group and entry", () => {
    expect(dashboardNavigationItem).toMatchObject({ href: "/app", label: "Dashboard" });
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
        "/app/reports/vat-report",
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

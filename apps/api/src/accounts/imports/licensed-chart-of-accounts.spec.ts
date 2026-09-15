import { AccountType, BalanceSide } from "@ledgerapp/db";

import {
  LicensedChartOfAccountsImportService,
  type LicensedChartOfAccountsAdapter
} from "./licensed-chart-of-accounts";

describe("LicensedChartOfAccountsImportService", () => {
  const service = new LicensedChartOfAccountsImportService();

  it("prepares explicitly licensed data without downloading or scraping it", async () => {
    const adapter: LicensedChartOfAccountsAdapter = {
      source: {
        licenseReference: "Customer licence agreement #2026-001",
        name: "Customer-provided BAS-compatible chart",
        version: "2026.1"
      },
      async loadRows() {
        return [
          {
            accountType: AccountType.ASSET,
            description: "  Main operating account ",
            name: " Bank account ",
            number: " 1930 ",
            vatCode: " moms25-ut "
          }
        ];
      }
    };

    await expect(service.prepare(adapter)).resolves.toEqual({
      accounts: [
        {
          accountType: AccountType.ASSET,
          description: "Main operating account",
          name: "Bank account",
          normalBalance: BalanceSide.DEBIT,
          number: "1930",
          vatCode: "MOMS25-UT"
        }
      ],
      source: adapter.source
    });
  });

  it("requires clear licence provenance and rejects duplicate account numbers", async () => {
    await expect(
      service.prepare({
        source: { licenseReference: "", name: "Unclear source", version: "1" },
        async loadRows() {
          return [];
        }
      })
    ).rejects.toThrow("license reference");

    await expect(
      service.prepare({
        source: {
          licenseReference: "Licensed",
          name: "Licensed source",
          version: "1"
        },
        async loadRows() {
          return [
            { accountType: AccountType.ASSET, name: "Bank", number: "1930" },
            { accountType: AccountType.EXPENSE, name: "Fees", number: "1930" }
          ];
        }
      })
    ).rejects.toThrow("duplicate account numbers");
  });
});

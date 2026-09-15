import { BadRequestException, Injectable } from "@nestjs/common";
import { AccountType, BalanceSide } from "@ledgerapp/db";

import { normalBalanceForAccountType } from "../account-normal-balance";

export interface LicensedChartSource {
  licenseReference: string;
  name: string;
  version: string;
}

export interface LicensedChartAccountRow {
  accountType: AccountType;
  description?: string;
  name: string;
  number: string;
  vatCode?: string;
}

/**
 * A future integration supplies licensed data through this boundary. It has no
 * network method by design, preventing incidental scraping or downloading.
 */
export interface LicensedChartOfAccountsAdapter {
  readonly source: LicensedChartSource;
  loadRows(): Promise<readonly LicensedChartAccountRow[]>;
}

export interface PreparedLicensedChart {
  accounts: Array<
    LicensedChartAccountRow & {
      normalBalance: BalanceSide;
    }
  >;
  source: LicensedChartSource;
}

@Injectable()
export class LicensedChartOfAccountsImportService {
  async prepare(adapter: LicensedChartOfAccountsAdapter): Promise<PreparedLicensedChart> {
    const source = this.normalizeSource(adapter.source);
    const accountNumbers = new Set<string>();
    const rows = await adapter.loadRows();

    const accounts = rows.map((row) => {
      const number = row.number.trim();
      const name = row.name.trim();

      if (!/^\d{1,16}$/.test(number) || !name) {
        throw new BadRequestException("Licensed chart contains an invalid account row.");
      }

      if (accountNumbers.has(number)) {
        throw new BadRequestException("Licensed chart contains duplicate account numbers.");
      }

      accountNumbers.add(number);

      return {
        accountType: row.accountType,
        description: row.description?.trim() || undefined,
        name,
        normalBalance: normalBalanceForAccountType(row.accountType),
        number,
        vatCode: row.vatCode?.trim().toUpperCase() || undefined
      };
    });

    return { accounts, source };
  }

  private normalizeSource(source: LicensedChartSource): LicensedChartSource {
    const licenseReference = source.licenseReference?.trim();
    const name = source.name?.trim();
    const version = source.version?.trim();

    if (!licenseReference || !name || !version) {
      throw new BadRequestException(
        "A licensed chart source must provide name, version and license reference."
      );
    }

    return { licenseReference, name, version };
  }
}

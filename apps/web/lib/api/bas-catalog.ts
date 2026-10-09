import type { AccountType } from "./accounts";
export interface CatalogItem {
  accountId: string | null;
  catalogAccountId: string | null;
  number: string;
  name: string;
  officialName: string | null;
  accountType: AccountType;
  category: "GROUP_ACCOUNT" | "MAIN_ACCOUNT" | "SUBACCOUNT" | null;
  accountGroup: string | null;
  className?: string | null;
  groupName: string | null;
  parentAccountNumber: string | null;
  isK2Restricted: boolean;
  isBookable?: boolean;
  activationEligible?: boolean;
  active: boolean;
  provenanceId: string | null;
  vatCode: string | null;
}
export interface CatalogResult {
  framework: "NOT_CONFIGURED" | "K2" | "K3";
  catalog: { id: string; version: string; sourceVersion: string; totalAccounts: number } | null;
  blockedReason: string | null;
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: { active: number; available: number; main: number; sub: number };
}
export interface ActivationPreview {
  selected: number;
  alreadyActive: number;
  canAdd: number;
  notAllowed: number;
  rows: {
    id: string;
    number: string;
    name: string;
    alreadyActive: boolean;
    allowed: boolean;
    reason: string | null;
  }[];
}

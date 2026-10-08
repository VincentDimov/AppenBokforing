"use client";
import { useCallback, useEffect, useState } from "react";
import { workspaceRequest } from "./workspace-api";

export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface AdminMembership {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  removedAt: string | null;
  organization: { id: string; name: string };
  user: { id: string; displayName: string; email: string };
}
export interface AdminUser {
  id: string;
  displayName: string;
  email: string;
  accountStatus: string;
  isActive: boolean;
  mustChangePassword: boolean;
  adminNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  organizationMemberships: AdminMembership[];
  _count: { organizationMemberships: number };
  platformAdministrator: {
    id: string;
    role: string;
    isActive: boolean;
    revokedAt: string | null;
  } | null;
}
export interface AdminOrganization {
  id: string;
  name: string;
  organizationNumber: string | null;
  address: string | null;
  countryCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: {
    members: number;
    fiscalYears?: number;
    journalEntries?: number;
    attachments?: number;
    sieImports?: number;
  };
  fiscalYears?: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
    _count: { accountingPeriods: number };
  }[];
  voucherSeries?: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    fiscalYearId: string;
  }[];
  voucherCounts?: { status: string; count: number }[];
}
export interface AdminAudit {
  id: string;
  actorUserId: string | null;
  actor: { displayName: string } | null;
  action: string;
  targetType: string;
  targetId: string | null;
  organizationId: string | null;
  timestamp: string;
  result: string;
  requestId: string | null;
  beforeMetadata: Record<string, unknown> | null;
  afterMetadata: Record<string, unknown> | null;
}
export interface AdminSession {
  id: string;
  userId: string;
  user?: { displayName: string };
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}
export interface AdminGrant {
  id: string;
  userId: string;
  role: string;
  isActive: boolean;
  revokedAt: string | null;
  grantedAt: string;
  grantedBy: { displayName: string } | null;
  user: {
    displayName: string;
    email: string;
    isActive: boolean;
    lastLoginAt: string | null;
    platformMfaCredential: { verifiedAt: string | null } | null;
  };
}
export interface AdminInvitation {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  organization: { id: string; name: string };
  invitedBy: { displayName: string };
}
export interface AdminOverview {
  from: string;
  to: string;
  kpis: Record<string, number>;
  registrations: { day: string; users: number; organizations: number }[];
  countries: { country: string; count: number }[];
  roles: { role: string; count: number }[];
  jobs: {
    imports: { status: string; count: number }[];
    exports: { status: string; count: number }[];
  };
  recent: AdminAudit[];
}
export interface AdminSystem {
  apiAvailable: boolean;
  databaseReady: boolean;
  migrationCompatible: boolean;
  applicationVersion: string;
  migrationState: { applied: number; failed: number } | null;
  mfaEncryptionConfigured: boolean;
  notificationDeliveryConfigured: boolean;
  externalMetricsAvailable: boolean;
  storageReadiness: string;
}
export const adminRequest = <T>(path: string, init?: RequestInit) =>
  workspaceRequest<T>(`/platform-admin${path}`, init);
export function useAdminData<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    adminRequest<T>(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : "Kunde inte hämta administrationen."
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { data, error, loading, reload };
}
export const adminDate = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value)
      )
    : "—";

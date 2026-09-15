"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

export interface AuthenticatedUser {
  displayName: string;
  email: string;
  id: string;
}

export interface OrganizationSummary {
  defaultCurrency: string;
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "ACCOUNTANT" | "MEMBER" | "READ_ONLY";
  slug: string;
}

type AuthenticationStatus = "anonymous" | "authenticated" | "error" | "loading";

interface AuthContextValue {
  activeOrganization: OrganizationSummary | null;
  activeOrganizationId: string;
  organizations: OrganizationSummary[];
  organizationsStatus: "error" | "idle" | "loading" | "ready";
  refresh: () => Promise<void>;
  setActiveOrganizationId: (organizationId: string) => void;
  signOut: () => Promise<void>;
  status: AuthenticationStatus;
  user: AuthenticatedUser | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);
let refreshRequest: Promise<boolean> | undefined;

function parseUser(payload: unknown): AuthenticatedUser | null {
  if (!payload || typeof payload !== "object" || !("user" in payload)) {
    return null;
  }

  const user = payload.user;

  if (!user || typeof user !== "object") {
    return null;
  }

  const candidate = user as Partial<AuthenticatedUser>;

  return typeof candidate.id === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.displayName === "string"
    ? (candidate as AuthenticatedUser)
    : null;
}

async function rotateRefreshSession(): Promise<boolean> {
  if (!refreshRequest) {
    refreshRequest = fetch("/api/auth/refresh", {
      credentials: "include",
      method: "POST"
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshRequest = undefined;
      });
  }

  return refreshRequest;
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [status, setStatus] = useState<AuthenticationStatus>("loading");
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [storedActiveOrganizationId, setStoredActiveOrganizationId] = useState("");
  const [organizationsStatus, setOrganizationsStatus] =
    useState<AuthContextValue["organizationsStatus"]>("idle");

  const loadOrganizations = useCallback(async () => {
    setOrganizationsStatus("loading");

    try {
      const response = await fetch("/api/organizations", {
        cache: "no-store",
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error("Could not load organizations.");
      }

      const payload: unknown = await response.json();
      setOrganizations(Array.isArray(payload) ? (payload as OrganizationSummary[]) : []);
      setOrganizationsStatus("ready");
    } catch {
      setOrganizations([]);
      setOrganizationsStatus("error");
    }
  }, []);

  const refresh = useCallback(async () => {
    setStatus("loading");

    try {
      let response = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "include"
      });

      if (response.status === 401 && (await rotateRefreshSession())) {
        response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include"
        });
      }

      if (response.status === 401) {
        setOrganizations([]);
        setOrganizationsStatus("idle");
        setStatus("anonymous");
        setUser(null);
        return;
      }

      if (!response.ok) {
        throw new Error("Could not restore the current session.");
      }

      const authenticatedUser = parseUser(await response.json());

      if (!authenticatedUser) {
        throw new Error("The authentication response was invalid.");
      }

      setStatus("authenticated");
      setUser(authenticatedUser);
      await loadOrganizations();
    } catch {
      setOrganizations([]);
      setOrganizationsStatus("error");
      setStatus("error");
      setUser(null);
    }
  }, [loadOrganizations]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (organizationsStatus !== "ready") {
      return;
    }

    const savedOrganizationId = window.localStorage.getItem("ledgerapp:active-organization");

    setStoredActiveOrganizationId((currentOrganizationId) => {
      const availableIds = organizations.map((organization) => organization.id);

      if (currentOrganizationId && availableIds.includes(currentOrganizationId)) {
        return currentOrganizationId;
      }

      if (savedOrganizationId && availableIds.includes(savedOrganizationId)) {
        return savedOrganizationId;
      }

      return organizations[0]?.id ?? "";
    });
  }, [organizations, organizationsStatus]);

  const setActiveOrganizationId = useCallback(
    (organizationId: string) => {
      if (!organizations.some((organization) => organization.id === organizationId)) {
        return;
      }

      setStoredActiveOrganizationId(organizationId);
      window.localStorage.setItem("ledgerapp:active-organization", organizationId);
    },
    [organizations]
  );

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        credentials: "include",
        method: "POST"
      });
    } finally {
      setOrganizations([]);
      setOrganizationsStatus("idle");
      setStoredActiveOrganizationId("");
      setStatus("anonymous");
      setUser(null);
    }
  }, []);

  const activeOrganization =
    organizations.find((organization) => organization.id === storedActiveOrganizationId) ??
    organizations[0] ??
    null;

  const value = useMemo<AuthContextValue>(
    () => ({
      activeOrganization,
      activeOrganizationId: activeOrganization?.id ?? "",
      organizations,
      organizationsStatus,
      refresh,
      setActiveOrganizationId,
      signOut,
      status,
      user
    }),
    [
      activeOrganization,
      organizations,
      organizationsStatus,
      refresh,
      setActiveOrganizationId,
      signOut,
      status,
      user
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}

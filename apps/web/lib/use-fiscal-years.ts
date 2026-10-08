"use client";
import {
  createContext,
  createElement,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode
} from "react";
import { workspaceRequest } from "./workspace-api";
export interface FiscalYearChoice {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED";
}
function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function useFiscalYearsSource(organizationId: string) {
  const [state, setState] = useState<{
    organizationId: string;
    years: FiscalYearChoice[];
    selected: string;
  }>({ organizationId: "", years: [], selected: "" });
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!organizationId) return;
    const reload = () => setRevision((value) => value + 1);
    window.addEventListener("ledgerapp:fiscal-years-changed", reload);
    return () => window.removeEventListener("ledgerapp:fiscal-years-changed", reload);
  }, [organizationId]);
  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    setError("");
    workspaceRequest<FiscalYearChoice[]>(`/fiscal-years?organizationId=${organizationId}`, {
      signal: controller.signal
    })
      .then((years) => {
        if (!Array.isArray(years)) throw new Error("Kunde inte läsa räkenskapsåren.");
        const saved = readPreference(`ledgerapp:fiscal-year:${organizationId}`);
        const today = new Date().toISOString().slice(0, 10);
        const selected =
          years.find((year) => year.id === saved)?.id ??
          years.find(
            (year) => year.startDate.slice(0, 10) <= today && year.endDate.slice(0, 10) >= today
          )?.id ??
          years[0]?.id ??
          "";
        if (!controller.signal.aborted) setState({ organizationId, years, selected });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [organizationId, revision]);
  useEffect(() => {
    if (!organizationId) return;
    const synchronize = () => {
      const id = readPreference(`ledgerapp:fiscal-year:${organizationId}`);
      setState((current) =>
        current.organizationId === organizationId && current.years.some((year) => year.id === id)
          ? { ...current, selected: id! }
          : current
      );
    };
    window.addEventListener("ledgerapp:fiscal-year", synchronize);
    window.addEventListener("storage", synchronize);
    return () => {
      window.removeEventListener("ledgerapp:fiscal-year", synchronize);
      window.removeEventListener("storage", synchronize);
    };
  }, [organizationId]);
  const select = useCallback(
    (id: string) => {
      if (state.organizationId !== organizationId || !state.years.some((year) => year.id === id))
        return;
      try {
        localStorage.setItem(`ledgerapp:fiscal-year:${organizationId}`, id);
      } catch {
        /* Preference storage is optional, never an accounting authority. */
      }
      window.dispatchEvent(new Event("ledgerapp:fiscal-year"));
      setState((current) => {
        if (
          current.organizationId !== organizationId ||
          !current.years.some((year) => year.id === id)
        )
          return current;
        return { ...current, selected: id };
      });
    },
    [organizationId, state]
  );
  const years = state.organizationId === organizationId ? state.years : [];
  const selected = state.organizationId === organizationId ? state.selected : "";
  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return {
    years,
    selected,
    select,
    error,
    retry,
    activeYear: years.find((year) => year.id === selected)
  };
}

const FiscalYearContext = createContext<{
  organizationId: string;
  value: ReturnType<typeof useFiscalYearsSource>;
} | null>(null);
export function FiscalYearProvider({
  organizationId,
  children
}: {
  organizationId: string;
  children: ReactNode;
}) {
  const value = useFiscalYearsSource(organizationId);
  return createElement(FiscalYearContext.Provider, { value: { organizationId, value } }, children);
}
export function useFiscalYears(organizationId: string) {
  const context = useContext(FiscalYearContext);
  const shared = context?.organizationId === organizationId;
  const fallback = useFiscalYearsSource(shared ? "" : organizationId);
  return shared ? context.value : fallback;
}

"use client";
import { useCallback, useEffect, useState } from "react";
import { workspaceRequest } from "./workspace-api";
export interface FiscalYearChoice {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED";
}
export function useFiscalYears(organizationId: string) {
  const [state, setState] = useState<{
    organizationId: string;
    years: FiscalYearChoice[];
    selected: string;
  }>({ organizationId: "", years: [], selected: "" });
  const [error, setError] = useState("");
  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    setError("");
    workspaceRequest<FiscalYearChoice[]>(`/fiscal-years?organizationId=${organizationId}`, {
      signal: controller.signal
    })
      .then((years) => {
        if (!Array.isArray(years)) throw new Error("Kunde inte läsa räkenskapsåren.");
        const saved = localStorage.getItem(`ledgerapp:fiscal-year:${organizationId}`);
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
  }, [organizationId]);
  useEffect(() => {
    const synchronize = () => {
      const id = localStorage.getItem(`ledgerapp:fiscal-year:${organizationId}`);
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
      localStorage.setItem(`ledgerapp:fiscal-year:${organizationId}`, id);
      window.dispatchEvent(new Event("ledgerapp:fiscal-year"));
      setState((current) => {
        if (
          current.organizationId !== organizationId ||
          !current.years.some((year) => year.id === id)
        )
          return current;
        localStorage.setItem(`ledgerapp:fiscal-year:${organizationId}`, id);
        return { ...current, selected: id };
      });
    },
    [organizationId, state]
  );
  const years = state.organizationId === organizationId ? state.years : [];
  const selected = state.organizationId === organizationId ? state.selected : "";
  return { years, selected, select, error, activeYear: years.find((year) => year.id === selected) };
}

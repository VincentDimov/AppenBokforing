"use client";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useFiscalYears } from "@/lib/use-fiscal-years";

export function FiscalYearSelect({
  value,
  onChange,
  className
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const { activeOrganizationId } = useAuth();
  const years = useFiscalYears(activeOrganizationId);
  useEffect(() => {
    if (!value && years.selected) onChange(years.selected);
  }, [value, years.selected, onChange]);
  return (
    <label className="grid gap-1 text-sm">
      Räkenskapsår
      <select
        aria-label="Räkenskapsår"
        className={className}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Välj räkenskapsår</option>
        {years.years.map((year) => (
          <option key={year.id} value={year.id}>
            {year.name} · {year.status === "CLOSED" ? "Stängt" : "Öppet"}
          </option>
        ))}
      </select>
      {years.error && <span role="alert">Räkenskapsåren kunde inte laddas.</span>}
    </label>
  );
}

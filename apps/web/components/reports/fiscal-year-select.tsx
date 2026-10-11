"use client";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useFiscalYears } from "@/lib/use-fiscal-years";
import { Button } from "@/components/ui/button";

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
    <div className="grid gap-1 text-sm">
      <label className="grid gap-1">
        Räkenskapsår
        <select
          aria-label="Räkenskapsår"
          className={className}
          value={value}
          disabled={!!years.error || years.years.length === 0}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Välj räkenskapsår</option>
          {years.years.map((year) => (
            <option key={year.id} value={year.id}>
              {year.name} · {year.status === "CLOSED" ? "Stängt" : "Öppet"}
            </option>
          ))}
        </select>
      </label>
      {years.error && (
        <span role="alert">
          Räkenskapsåren kunde inte laddas. {years.error}
          <Button type="button" variant="outline" onClick={years.retry}>
            Läs räkenskapsår igen
          </Button>
        </span>
      )}
    </div>
  );
}

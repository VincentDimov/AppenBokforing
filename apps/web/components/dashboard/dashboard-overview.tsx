import { CalendarDays, CircleHelp, FileText, Plus } from "lucide-react";
import Link from "next/link";

import { LatestVouchers } from "@/components/dashboard/latest-vouchers";
import { MetricCard } from "@/components/dashboard/metric-card";
import { QuickActionCard } from "@/components/dashboard/quick-action-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dashboardMockData } from "@/lib/mock-data/dashboard";

export function DashboardOverview() {
  return (
    <div className="mx-auto max-w-[1400px]">
      <section className="flex flex-col justify-between gap-6 border-b border-[#ccdce4] pb-7 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold tracking-[0.13em] text-[#638292] uppercase">
              Dashboard
            </p>
            <Badge variant="warning">Exempeldata</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#12374c] sm:text-4xl">
            Läget i bokföringen
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[#58717e]">
            En snabb överblick över organisationens ekonomi och senaste aktivitet.
          </p>
        </div>
        <Button asChild className="shrink-0" size="wide">
          <Link href="/app/bookkeeping/vouchers/new">
            <Plus aria-hidden="true" className="size-4" />
            Ny verifikation
          </Link>
        </Button>
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#668291]">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays aria-hidden="true" className="size-3.5" />
          Uppdaterat {dashboardMockData.asOf}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CircleHelp aria-hidden="true" className="size-3.5" />
          Belopp visas som exempel tills bokförings-API:t är anslutet.
        </span>
      </div>

      <section
        aria-label="Ekonomisk översikt"
        className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {dashboardMockData.metrics.map((metric) => (
          <MetricCard currency={dashboardMockData.currency} key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <LatestVouchers
          currency={dashboardMockData.currency}
          vouchers={dashboardMockData.latestVouchers}
        />
        <div className="space-y-6">
          <QuickActionCard />
          <section className="border border-[#d6e3e9] bg-[#f7fafb] p-5">
            <FileText aria-hidden="true" className="size-5 text-[#4c7d92]" />
            <h2 className="mt-4 text-base font-semibold text-[#17384b]">Från demo till data</h2>
            <p className="mt-2 text-sm leading-6 text-[#58717e]">
              Organisationsnamn och behörighet är verkliga. Nyckeltalen är fortfarande avgränsad
              exempeldata, medan verifikationer hanteras i bokföringsvyn.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}

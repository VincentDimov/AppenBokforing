"use client";
import Link from "next/link";
import { useState } from "react";
import { PageHeader, Panel } from "@/components/ui/workspace";
import { Button } from "@/components/ui/button";
import { useAdminData, type AdminOverview, adminDate } from "@/lib/platform-admin";
import { AdminResult, AdminTable } from "./admin-shared";

const labels: Record<string, string> = {
  users: "Användare",
  activeUsers: "Aktiva användare",
  suspendedUsers: "Avstängda",
  inactiveUsers: "Inaktiva användare",
  newUsers: "Nya användare i perioden",
  organizations: "Företag",
  activeOrganizations: "Aktiva företag",
  inactiveOrganizations: "Inaktiva företag",
  memberships: "Aktiva medlemskap",
  pendingInvitations: "Väntande inbjudningar",
  administrators: "Aktiva plattformsadministratörer",
  securityEvents: "Nekade säkerhetshändelser i perioden",
  failedImports: "Misslyckade importer i perioden"
};
export function AdminOverviewPage({ embedded = false }: { embedded?: boolean }) {
  const [interval, setInterval] = useState<{ fromDate?: string; toDate?: string }>({});
  const state = useAdminData<AdminOverview>("/dashboard?" + new URLSearchParams(interval));
  return (
    <div className="space-y-6">
      <PageHeader
        title={embedded ? "Plattformsöversikt" : "Adminöversikt"}
        context="Master Admin"
        description="Verklig plattformsstatistik. Företagens ekonomiska data visas endast i behöriga företagsvyer."
        action={
          embedded ? (
            <Button asChild>
              <Link href="/admin">Öppna administration</Link>
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-wrap gap-2" aria-label="Statistikperiod">
        {[
          [7, "7 dagar"],
          [30, "30 dagar"],
          [90, "90 dagar"],
          [365, "12 månader"]
        ].map(([days, label]) => (
          <Button
            key={days}
            variant="outline"
            onClick={() => {
              const end = new Date();
              setInterval({
                fromDate: new Date(end.getTime() - Number(days) * 86400000).toISOString(),
                toDate: end.toISOString()
              });
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          setInterval({
            fromDate: String(values.get("from")) + "T00:00:00.000Z",
            toDate: String(values.get("to")) + "T23:59:59.999Z"
          });
        }}
      >
        <label className="text-sm">
          Från
          <input type="date" name="from" required className="mt-1 block rounded border p-2" />
        </label>
        <label className="text-sm">
          Till
          <input type="date" name="to" required className="mt-1 block rounded border p-2" />
        </label>
        <Button variant="outline">Visa period</Button>
      </form>
      <AdminResult {...state} retry={state.reload}>
        {state.data && (
          <>
            <p className="text-sm text-muted">
              Period: {adminDate(state.data.from)} – {adminDate(state.data.to)} · Registreringar
              grupperas per UTC-dygn.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(state.data.kpis).map(([key, value]) => (
                <Panel key={key} className="p-5">
                  <p className="text-sm text-muted">{labels[key] ?? key}</p>
                  <p className="mt-3 text-3xl font-semibold tabular-nums">
                    {value.toLocaleString("sv-SE")}
                  </p>
                </Panel>
              ))}
            </div>
            <Panel className="p-5">
              <h2 className="mb-4 font-semibold">Registreringar</h2>
              <AdminTable
                headers={["Datum", "Användare", "Företag"]}
                label="Registreringar per dag"
              >
                {state.data.registrations.map((row) => (
                  <tr key={row.day}>
                    <td className="p-3">{row.day}</td>
                    <td className="p-3 tabular-nums">
                      {row.users}
                      <span
                        aria-hidden="true"
                        className="ml-2 inline-block h-2 rounded bg-accent"
                        style={{ width: Math.min(row.users * 8, 200) }}
                      />
                    </td>
                    <td className="p-3 tabular-nums">{row.organizations}</td>
                  </tr>
                ))}
              </AdminTable>
            </Panel>
            <div className="grid gap-4 md:grid-cols-2">
              <Panel className="p-5">
                <h2 className="font-semibold">Aktiva och inaktiva användare</h2>
                <p className="mt-2">
                  Aktiva: {state.data.kpis.activeUsers} · Inaktiva inklusive avstängda:{" "}
                  {state.data.kpis.inactiveUsers}
                </p>
              </Panel>
              <Panel className="p-5">
                <h2 className="font-semibold">SIE-aktivitet under perioden</h2>
                {state.data.jobs.imports.map((row) => (
                  <p className="mt-2" key={"i" + row.status}>
                    Import {row.status}: {row.count}
                  </p>
                ))}
                {state.data.jobs.exports.map((row) => (
                  <p className="mt-2" key={"e" + row.status}>
                    Export {row.status}: {row.count}
                  </p>
                ))}
              </Panel>
              <Panel className="p-5">
                <h2 className="font-semibold">Företag per land</h2>
                {state.data.countries.map((row) => (
                  <p className="mt-2" key={row.country}>
                    {row.country}: {row.count}
                  </p>
                ))}
              </Panel>
              <Panel className="p-5">
                <h2 className="font-semibold">Aktiva företagsroller</h2>
                {state.data.roles.map((row) => (
                  <p className="mt-2" key={row.role}>
                    {row.role}: {row.count}
                  </p>
                ))}
              </Panel>
            </div>
            <Panel className="p-5">
              <h2 className="mb-3 font-semibold">Senaste adminhändelser</h2>
              <AdminTable
                headers={["Tid", "Aktör", "Åtgärd", "Resultat"]}
                label="Senaste adminhändelser"
              >
                {state.data.recent.map((row) => (
                  <tr key={row.id}>
                    <td className="p-3">{adminDate(row.timestamp)}</td>
                    <td className="p-3">{row.actor?.displayName ?? "Operatör/system"}</td>
                    <td className="p-3">{row.action}</td>
                    <td className="p-3">{row.result}</td>
                  </tr>
                ))}
              </AdminTable>
              <Link className="mt-4 inline-block text-accent underline" href="/admin/audit">
                Visa full historik
              </Link>
            </Panel>
          </>
        )}
      </AdminResult>
    </div>
  );
}

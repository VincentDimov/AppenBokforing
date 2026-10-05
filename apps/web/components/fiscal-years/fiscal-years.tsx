"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

type Period = {
  id: string;
  periodNumber: number;
  startDate: string;
  endDate: string;
  status: "OPEN" | "LOCKED";
};
type Year = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED";
  accountingPeriods: Period[];
};
type Confirmation = { path: string; message: string; organizationId: string };
const field = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";
const date = (value: string) => value.slice(0, 10);

export function FiscalYears() {
  const { activeOrganizationId, activeOrganization } = useAuth();
  const organizationRef = useRef(activeOrganizationId);
  organizationRef.current = activeOrganizationId;
  const [result, setResult] = useState<{ organizationId: string; years: Year[] } | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "" });
  const canManage = ["OWNER", "ADMIN"].includes(activeOrganization?.role ?? "");
  const canLock = canManage || activeOrganization?.role === "ACCOUNTANT";
  const years = result?.organizationId === activeOrganizationId ? result.years : [];
  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmation?.organizationId === activeOrganizationId && dialog && !dialog.open)
      dialog.showModal();
    else dialog?.close();
  }, [confirmation, activeOrganizationId]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setConfirmation(null);
    if (!activeOrganizationId) return;
    setLoading(true);
    void fetch(
      `/api/fiscal-years?${new URLSearchParams({ organizationId: activeOrganizationId })}`,
      {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal
      }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Räkenskapsåren kunde inte hämtas.");
        return response.json() as Promise<Year[]>;
      })
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({ organizationId: activeOrganizationId, years: data });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Ett fel uppstod.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [activeOrganizationId, revision]);

  async function write(path: string, body: Record<string, unknown>) {
    const organizationId = activeOrganizationId;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, organizationId })
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as { message?: string | string[] };
        throw new Error(
          Array.isArray(detail.message)
            ? detail.message.join(" ")
            : detail.message || "Ändringen kunde inte sparas."
        );
      }
      if (organizationRef.current === organizationId) {
        setConfirmation(null);
        setRevision((value) => value + 1);
      }
    } catch (reason) {
      if (organizationRef.current === organizationId)
        setError(reason instanceof Error ? reason.message : "Ett fel uppstod.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Räkenskapsår</h1>
        <p className="mt-2 text-sm text-slate-600">
          Låsta perioder är tillgängliga för visning och rapporter, men kan inte ändras eller ta
          emot bokföring.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {canManage && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void write("fiscal-years", form);
          }}
        >
          <label className="grid gap-1 text-sm">
            Namn
            <input
              className={field}
              required
              maxLength={80}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Startdatum
            <input
              className={field}
              type="date"
              required
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Slutdatum
            <input
              className={field}
              type="date"
              required
              min={form.startDate}
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </label>
          <Button disabled={busy || !activeOrganizationId}>Skapa räkenskapsår</Button>
        </form>
      )}
      {loading && <p role="status">Hämtar räkenskapsår…</p>}
      {!loading && !years.length && <p>Inga räkenskapsår finns för organisationen.</p>}
      {years.map((year) => (
        <article key={year.id} className="overflow-hidden rounded-xl border bg-white">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <div>
              <h2 className="font-semibold">
                {year.name} · {year.status === "CLOSED" ? "Stängt" : "Öppet"}
              </h2>
              <p className="text-sm text-slate-600">
                {date(year.startDate)} – {date(year.endDate)}
              </p>
            </div>
            {canManage && year.status === "OPEN" && (
              <Button
                variant="outline"
                disabled={busy || year.accountingPeriods.some((p) => p.status !== "LOCKED")}
                onClick={() =>
                  setConfirmation({
                    path: `fiscal-years/${year.id}/close`,
                    organizationId: activeOrganizationId,
                    message: `Stäng räkenskapsåret ${year.name}? Alla perioder måste vara låsta och inga utkast får finnas kvar. Året kan inte öppnas igen i applikationen.`
                  })
                }
              >
                Stäng räkenskapsår
              </Button>
            )}
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-4">Period</th>
                  <th className="p-4">Datum</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Åtgärd</th>
                </tr>
              </thead>
              <tbody>
                {year.accountingPeriods.map((period) => (
                  <tr key={period.id} className="border-t">
                    <td className="p-4">{period.periodNumber}</td>
                    <td className="p-4">
                      {date(period.startDate)} – {date(period.endDate)}
                    </td>
                    <td className="p-4">{period.status === "LOCKED" ? "Låst" : "Öppen"}</td>
                    <td className="p-4">
                      {canLock && year.status === "OPEN" && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            setConfirmation({
                              organizationId: activeOrganizationId,
                              path: `accounting-periods/${period.id}/${period.status === "OPEN" ? "lock" : "unlock"}`,
                              message:
                                period.status === "OPEN"
                                  ? `Lås period ${period.periodNumber} (${date(period.startDate)} – ${date(period.endDate)})? Bokföring och ändringar blockeras. Åtgärden loggas.`
                                  : `Lås upp period ${period.periodNumber}? Bokföring och ändringar tillåts igen. Åtgärden loggas.`
                            })
                          }
                        >
                          {period.status === "OPEN" ? "Lås period" : "Lås upp"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
      {confirmation && confirmation.organizationId === activeOrganizationId && (
        <dialog
          ref={dialogRef}
          onCancel={(event) => {
            if (busy) event.preventDefault();
            else setConfirmation(null);
          }}
          aria-labelledby="calendar-confirm-title"
          className="m-auto max-w-lg space-y-5 rounded-xl bg-white p-6 shadow-xl backdrop:bg-slate-950/40"
        >
          <h2 id="calendar-confirm-title" className="text-lg font-semibold">
            Bekräfta ändring
          </h2>
          <p>{confirmation.message}</p>
          <div className="flex justify-end gap-3">
            <Button
              autoFocus
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Avbryt
            </Button>
            <Button
              disabled={busy}
              onClick={() => void write(confirmation.path, { confirm: true })}
            >
              Bekräfta
            </Button>
          </div>
        </dialog>
      )}
    </section>
  );
}

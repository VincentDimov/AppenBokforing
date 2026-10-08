"use client";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/workspace";
import { useAuth } from "@/components/auth/auth-provider";
import { useFiscalYears, type FiscalYearChoice } from "@/lib/use-fiscal-years";
import { workspaceRequest } from "@/lib/workspace-api";
import { calculateVoucherAmounts, formatOre, parseMoneyToOre } from "@/lib/vouchers";
interface Account {
  id: string;
  accountNumber: string;
  name: string;
  type: string;
}
interface BalanceData {
  fingerprint: string;
  accounts: Account[];
  editable: boolean;
  rows: { accountId: string; debitAmount: string; creditAmount: string }[];
}
interface Row {
  accountId: string;
  debit: string;
  credit: string;
}
interface Preview {
  previewId: string;
  source: { id: string };
  target: { id: string };
  resultAccountId: string;
  resultNet: string;
  totals: { debit: string; credit: string };
  rows: {
    accountId: string;
    number: string;
    name: string;
    closingBalance: string;
    debit: string;
    credit: string;
  }[];
}
export function OpeningBalancesPage() {
  const { activeOrganization } = useAuth();
  if (!activeOrganization) return <p>Välj organisation.</p>;
  return (
    <OpeningWorkspace
      key={activeOrganization.id}
      org={activeOrganization.id}
      role={activeOrganization.role}
    />
  );
}
function OpeningWorkspace({ org, role }: { org: string; role: string }) {
  const years = useFiscalYears(org);
  const canWrite = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(role);
  return (
    <section className="space-y-6">
      <PageHeader
        title="Ingående balans"
        context="Inställningar"
        description="Registrera ingående balanser eller granska en årsöverföring."
      />
      <label className="my-4 block">
        Räkenskapsår
        <select
          className="ml-3 border p-2"
          value={years.selected}
          onChange={(event) => years.select(event.target.value)}
        >
          {years.years.map((year) => (
            <option key={year.id} value={year.id}>
              {year.name}
            </option>
          ))}
        </select>
      </label>
      <p role="alert">{years.error}</p>
      {years.selected && (
        <OpeningEditor key={years.selected} org={org} year={years.selected} canWrite={canWrite} />
      )}
      {canWrite && <CarryForward org={org} years={years.years} />}
    </section>
  );
}
function OpeningEditor({ org, year, canWrite }: { org: string; year: string; canWrite: boolean }) {
  const [data, setData] = useState<BalanceData | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    workspaceRequest<BalanceData>(`/organizations/${org}/opening-balances?fiscalYear=${year}`, {
      signal: controller.signal
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setData(data);
        setRows(
          data.accounts.map((account) => {
            const row = data.rows.find((row) => row.accountId === account.id);
            return {
              accountId: account.id,
              debit: row?.debitAmount ?? "0.00",
              credit: row?.creditAmount ?? "0.00"
            };
          })
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      });
    return () => controller.abort();
  }, [org, year]);
  const totals = calculateVoucherAmounts(rows);
  const valid =
    !!totals &&
    totals.difference === 0n &&
    rows.every((row) => {
      const debit = parseMoneyToOre(row.debit),
        credit = parseMoneyToOre(row.credit);
      return debit !== null && credit !== null && !(debit > 0n && credit > 0n);
    });
  function edit(index: number, field: "debit" | "credit", value: string) {
    setRows((current) =>
      current.map((row, at) => (index === at ? { ...row, [field]: value } : row))
    );
  }
  async function save() {
    if (!data || !valid) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await workspaceRequest<{ fingerprint: string }>(
        `/organizations/${org}/opening-balances`,
        {
          method: "POST",
          body: JSON.stringify({
            fiscalYearId: year,
            expectedFingerprint: data.fingerprint,
            rows: rows.map((row) => ({
              ...row,
              debit: row.debit.replace(",", "."),
              credit: row.credit.replace(",", ".")
            }))
          })
        }
      );
      setData({ ...data, fingerprint: response.fingerprint });
      setMessage("Ingående balans sparad.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunde inte spara IB.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p className="my-3">
        Endast balanskonton. Hela uppsättningen måste balansera. IB låses efter första bokföringen,
        periodlås eller årsstängning.
      </p>
      <fieldset disabled={!canWrite || !data?.editable || busy}>
        <div className="table-frame" tabIndex={0}>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>Konto</th>
                <th>Namn</th>
                <th className="text-right">Debet</th>
                <th className="text-right">Kredit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.accountId} className="border-t">
                  <td>{data?.accounts[index]?.accountNumber}</td>
                  <td>{data?.accounts[index]?.name}</td>
                  <td>
                    <input
                      className="my-2 w-32 border p-2"
                      aria-label={`IB debet ${data?.accounts[index]?.accountNumber}`}
                      inputMode="decimal"
                      value={row.debit}
                      onChange={(event) => edit(index, "debit", event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="my-2 w-32 border p-2"
                      aria-label={`IB kredit ${data?.accounts[index]?.accountNumber}`}
                      inputMode="decimal"
                      value={row.credit}
                      onChange={(event) => edit(index, "credit", event.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="my-4">
          Debet: {totals ? formatOre(totals.debit) : "Ogiltigt"} · Kredit:{" "}
          {totals ? formatOre(totals.credit) : "Ogiltigt"} · Differens:{" "}
          {totals ? formatOre(totals.difference) : "Ogiltigt"}
        </p>
        {canWrite && (
          <button
            className="rounded bg-accent p-3 text-white"
            disabled={!valid || !data?.editable || busy}
            onClick={() => void save()}
          >
            Spara ingående balans
          </button>
        )}
      </fieldset>
      <p role="status">{message}</p>
    </div>
  );
}
function CarryForward({ org, years }: { org: string; years: FiscalYearChoice[] }) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [account, setAccount] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    workspaceRequest<{ id: string; number: string; name: string; accountType: string }[]>(
      `/accounts?organizationId=${org}`,
      { signal: controller.signal }
    )
      .then((accounts) =>
        setAccounts(
          accounts
            .filter((account) => account.accountType === "EQUITY")
            .map((account) => ({
              ...account,
              accountNumber: account.number,
              type: account.accountType
            }))
        )
      )
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      });
    return () => controller.abort();
  }, [org]);
  const carryInFlight = useRef(false);
  async function run(confirm: boolean) {
    if (carryInFlight.current) return;
    carryInFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (confirm && preview) {
        await workspaceRequest(`/organizations/${org}/carry-forward/confirm`, {
          method: "POST",
          body: JSON.stringify({ previewId: preview.previewId })
        });
        setPreview(null);
        setMessage(
          "Årsöverföringen är bekräftad. Välj målåret eller läs om dess IB för att se det nya saldot."
        );
      } else
        setPreview(
          await workspaceRequest<Preview>(`/organizations/${org}/carry-forward/preview`, {
            method: "POST",
            body: JSON.stringify({
              sourceFiscalYearId: source,
              targetFiscalYearId: target,
              resultAccountId: account
            })
          })
        );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Överföringen kunde inte genomföras.");
    } finally {
      carryInFlight.current = false;
      setBusy(false);
    }
  }
  function invalidate(setter: (value: string) => void, value: string) {
    setter(value);
    setPreview(null);
    setMessage("");
  }
  return (
    <section className="mt-10 border-t pt-6">
      <h2 className="text-xl font-semibold">Överför stängt år till nästa år</h2>
      <p className="my-3">
        Källåret måste vara stängt. Målåret börjar dagen efter och får inte ha IB. Resultatet förs
        till ett eget-kapital-konto som du uttryckligen väljer. Detta ersätter inte ett komplett
        svenskt årsbokslut.
      </p>
      <fieldset disabled={busy} className="flex flex-wrap gap-4">
        <label>
          Källår
          <select
            className="block border p-2"
            value={source}
            onChange={(event) => invalidate(setSource, event.target.value)}
          >
            <option value="">Välj stängt år</option>
            {years
              .filter((year) => year.status === "CLOSED")
              .map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Målår
          <select
            className="block border p-2"
            value={target}
            onChange={(event) => invalidate(setTarget, event.target.value)}
          >
            <option value="">Välj öppet år</option>
            {years
              .filter((year) => year.status === "OPEN")
              .map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Resultatkonto i eget kapital
          <select
            className="block border p-2"
            value={account}
            onChange={(event) => invalidate(setAccount, event.target.value)}
          >
            <option value="">Välj explicit konto</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.accountNumber} {account.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="rounded border p-3"
          disabled={!source || !target || !account}
          onClick={() => void run(false)}
        >
          Förhandsgranska årsöverföring
        </button>
      </fieldset>
      {preview && (
        <div className="my-5">
          <h3 className="font-semibold">
            {years.find((year) => year.id === preview.source.id)?.name} →{" "}
            {years.find((year) => year.id === preview.target.id)?.name}
          </h3>
          <p>
            Resultatnetto (debet − kredit): {preview.resultNet}. Vald resultatdestination ingår i
            målårets IB.
          </p>
          <div className="table-frame" tabIndex={0}>
            <table className="my-3 w-full text-left">
              <thead>
                <tr>
                  <th>Konto</th>
                  <th>UB före resultatöverföring</th>
                  <th>Ny IB debet</th>
                  <th>Ny IB kredit</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.accountId}>
                    <td>
                      {row.number} {row.name}
                    </td>
                    <td className="text-right tabular-nums">{row.closingBalance}</td>
                    <td className="text-right tabular-nums">{row.debit}</td>
                    <td className="text-right tabular-nums">{row.credit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Totalt debet {preview.totals.debit} · kredit {preview.totals.credit}
          </p>
          <button
            disabled={busy}
            className="my-3 rounded bg-accent p-3 text-white"
            onClick={() => setConfirmOpen(true)}
          >
            Bekräfta årsöverföring
          </button>
        </div>
      )}
      <p role="status">{message}</p>
      <ConfirmDialog
        open={confirmOpen}
        title="Bekräfta årsöverföringen?"
        description="Den granskade förhandsvisningen förs till målårets ingående balans. Ingen befintlig IB skrivs över. Kontrollera år och resultatkonto innan du fortsätter."
        confirmLabel="Genomför årsöverföring"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void run(true);
        }}
        busy={busy}
      />
    </section>
  );
}

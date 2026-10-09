"use client";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { AccountEditor } from "./account-editor";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, LoadingState, PageHeader } from "@/components/ui/workspace";
import { accountTypeLabels, type Account } from "@/lib/api/accounts";
import type { ActivationPreview, CatalogItem, CatalogResult } from "@/lib/api/bas-catalog";
import { workspaceRequest } from "@/lib/workspace-api";

const tabs = [
  ["all", "Alla BAS-konton"],
  ["active", "Aktiva konton"],
  ["available", "Tillgängliga BAS-konton"],
  ["custom", "Egna konton"]
];
const categories = {
  GROUP_ACCOUNT: "Gruppkonto",
  MAIN_ACCOUNT: "Huvudkonto",
  SUBACCOUNT: "Underkonto"
};
const options = {
  accountClass: [
    ["", "Alla klasser"],
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => [String(n), String(n)])
  ],
  category: [["", "Alla kategorier"], ...Object.entries(categories)],
  status: [
    ["", "Alla"],
    ["active", "Aktivt"],
    ["inactive", "Inaktivt"]
  ],
  compatibility: [
    ["", "Alla"],
    ["compatible", "Utan K2-begränsning"],
    ["restricted", "K3 krävs"]
  ],
  sort: [
    ["number", "Kontonummer"],
    ["name-asc", "Namn A–Ö"],
    ["name-desc", "Namn Ö–A"]
  ]
};
const labels = {
  accountClass: "Kontoklass",
  category: "Kategori",
  status: "Status",
  compatibility: "K2-markering",
  sort: "Sortera"
};
const control = "rounded border border-border bg-white p-2 text-sm";
export function BasAccountsPage() {
  const { activeOrganization } = useAuth();
  if (!activeOrganization) return <p>Välj organisation för kontoplanen.</p>;
  return (
    <Workspace
      key={activeOrganization.id}
      org={activeOrganization.id}
      name={activeOrganization.name}
      role={activeOrganization.role}
    />
  );
}
function Workspace({ org, name, role }: { org: string; name: string; role: string }) {
  const [data, setData] = useState<CatalogResult | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState({
      accountClass: "",
      group: "",
      category: "",
      status: "",
      compatibility: "",
      sort: "number"
    }),
    [grouped, setGrouped] = useState(false),
    [groupInput, setGroupInput] = useState("");
  const [selection, setSelection] = useState<string[]>([]),
    [preview, setPreview] = useState<ActivationPreview | null>(null),
    [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ account: Account | null } | null>(null),
    [frameworkDialog, setFrameworkDialog] = useState(false),
    [framework, setFramework] = useState("NOT_CONFIGURED"),
    [confirmation, setConfirmation] = useState("");
  const deferredSearch = useDeferredValue(search),
    inFlight = useRef(false),
    mutation = useRef<AbortController | null>(null);
  const canManage = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(role),
    canFramework = ["OWNER", "ADMIN"].includes(role);
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      organizationId: org,
      tab,
      page: String(page),
      pageSize: "50"
    });
    if (deferredSearch.trim()) params.set("q", deferredSearch.trim());
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    void workspaceRequest<CatalogResult>(`/accounts/catalog?${params}`, {
      signal: controller.signal
    })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(failure instanceof Error ? failure.message : "Kontoplanen kunde inte laddas.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [org, tab, page, deferredSearch, filters, revision]);
  function invalidate() {
    setSelection([]);
    setPreview(null);
    setPage(1);
  }
  function reload() {
    setSelection([]);
    setPreview(null);
    setRevision((v) => v + 1);
  }
  async function act(operation: (signal: AbortSignal) => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    mutation.current = controller;
    try {
      await operation(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Åtgärden misslyckades.");
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function allowed(row: CatalogItem) {
    return (
      !!row.catalogAccountId &&
      !row.active &&
      row.isBookable !== false &&
      row.activationEligible !== false &&
      (!row.isK2Restricted || data?.framework === "K3")
    );
  }
  const groups = new Map<string, CatalogItem[]>();
  for (const row of data?.items ?? []) {
    const key = row.accountGroup ?? row.number.slice(0, 2);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const table = (items: CatalogItem[]) => (
    <div className="table-frame" tabIndex={0}>
      <table className="w-full min-w-[52rem] text-left text-sm">
        <thead>
          <tr>
            {canManage ? <th className="p-3">Markera</th> : null}
            <th className="p-3">Konto</th>
            <th className="p-3">Kontonamn</th>
            <th className="p-3">Typ</th>
            <th className="p-3">Momskod</th>
            <th className="p-3">Status</th>
            {canManage ? <th className="p-3">Åtgärd</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr
              key={row.accountId ?? row.catalogAccountId ?? row.number}
              className="border-b border-border"
            >
              {canManage ? (
                <td className="p-3">
                  {row.catalogAccountId ? (
                    <input
                      type="checkbox"
                      aria-label={`Markera konto ${row.number}`}
                      checked={selection.includes(row.catalogAccountId)}
                      disabled={busy || loading || !allowed(row)}
                      onChange={() =>
                        setSelection((current) =>
                          current.includes(row.catalogAccountId!)
                            ? current.filter((id) => id !== row.catalogAccountId)
                            : current.length < 100
                              ? [...current, row.catalogAccountId!]
                              : current
                        )
                      }
                    />
                  ) : null}
                </td>
              ) : null}
              <td className="p-3 font-mono">{row.number}</td>
              <td className="max-w-lg p-3">
                <span>{row.name}</span>
                {row.officialName && row.name !== row.officialName ? (
                  <small className="block text-muted">BAS: {row.officialName}</small>
                ) : null}
                <small className="block text-muted">
                  {row.category ? categories[row.category] : "Eget konto"}
                  {row.parentAccountNumber ? ` · tillhör ${row.parentAccountNumber}` : ""}
                </small>
              </td>
              <td className="p-3">{accountTypeLabels[row.accountType]}</td>
              <td className="p-3">{row.vatCode ?? "—"}</td>
              <td className="p-3">
                {row.active ? "Aktivt" : "Inaktivt"}
                {row.isK2Restricted ? (
                  <span className="block text-amber-800">K3 krävs · inte K2</span>
                ) : null}
              </td>
              {canManage ? (
                <td className="p-3">
                  {row.catalogAccountId && !row.active ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Lägg till konto ${row.number}`}
                      disabled={busy || loading || !allowed(row)}
                      onClick={() =>
                        void act(async (signal) => {
                          const result = await workspaceRequest<ActivationPreview>(
                            "/accounts/catalog/activation-preview",
                            {
                              method: "POST",
                              signal,
                              body: JSON.stringify({
                                organizationId: org,
                                catalogAccountIds: [row.catalogAccountId]
                              })
                            }
                          );
                          if (!signal.aborted) setPreview(result);
                        })
                      }
                    >
                      Lägg till
                    </Button>
                  ) : null}
                  {row.accountId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      aria-label={`Redigera konto ${row.number}`}
                      onClick={() =>
                        void act(async (signal) => {
                          const account = await workspaceRequest<Account>(
                            `/accounts/${row.accountId}`,
                            { signal }
                          );
                          if (!signal.aborted) setEditor({ account });
                        })
                      }
                    >
                      Redigera
                    </Button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <section className="space-y-5">
      <PageHeader
        title="Konton"
        context="Register · Kontoplan"
        description={`Kontoplan för ${name}. Historiken bevaras när ett konto avaktiveras.`}
        action={
          canManage ? (
            <Button type="button" onClick={() => setEditor({ account: null })}>
              Nytt konto
            </Button>
          ) : undefined
        }
      />
      <p>
        {data?.catalog
          ? `${data.catalog.version} · källversion ${data.catalog.sourceVersion} · ${data.catalog.totalAccounts} BAS-konton`
          : data?.blockedReason}{" "}
        · K-regelverk: {data?.framework ?? "—"}
      </p>
      {data ? (
        <p>
          Aktiva: {data.counts.active} · Tillgängliga BAS: {data.counts.available} · Huvud- och
          gruppkonton: {data.counts.main} · Underkonton: {data.counts.sub}
        </p>
      ) : null}
      {canFramework ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setFramework(data?.framework ?? "NOT_CONFIGURED");
            setConfirmation("");
            setFrameworkDialog(true);
          }}
        >
          Ändra K-regelverk
        </Button>
      ) : null}
      {canManage && data?.catalog ? (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void act(async (signal) => {
              const result = await workspaceRequest<{
                inserted: number;
                preserved: number;
                conflicts: string[];
              }>("/accounts/catalog/provision", {
                method: "POST",
                signal,
                body: JSON.stringify({ organizationId: org, versionId: data.catalog!.id })
              });
              if (signal.aborted) return;
              setNotice(
                `${result.inserted} standardkonton tillagda. ${result.preserved} bevarade.${result.conflicts.length ? ` Granska klassificering: ${result.conflicts.join(", ")}.` : ""}`
              );
              reload();
            })
          }
        >
          Lägg till saknade standardkonton
        </Button>
      ) : null}
      <nav aria-label="Kontoplanens flikar" className="flex flex-wrap gap-2">
        {tabs.map(([value, label]) => (
          <Button
            key={value}
            type="button"
            aria-pressed={tab === value}
            variant={tab === value ? "default" : "outline"}
            onClick={() => {
              setTab(value!);
              invalidate();
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
      <div className="flex flex-wrap items-end gap-3">
        <label>
          Sök kontonummer eller namn
          <input
            type="search"
            className={`${control} block`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              invalidate();
            }}
          />
        </label>
        {(Object.keys(options) as (keyof typeof options)[]).map((key) => (
          <label key={key}>
            {labels[key]}
            <select
              className={`${control} block`}
              value={filters[key]}
              onChange={(e) => {
                setFilters((f) => ({ ...f, [key]: e.target.value }));
                invalidate();
              }}
            >
              {options[key].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Kontogrupp
          <input
            className={`${control} block w-24`}
            inputMode="numeric"
            maxLength={2}
            value={groupInput}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, "");
              setGroupInput(value);
              setFilters((f) => ({ ...f, group: /^[1-8]\d$/.test(value) ? value : "" }));
              invalidate();
            }}
            placeholder="Alla"
          />
        </label>
        <label>
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />{" "}
          Grupperad vy
        </label>
      </div>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? (
        <div role="alert" className="rounded bg-danger-soft p-4 text-danger">
          {error}
          <Button type="button" variant="outline" onClick={reload}>
            Försök igen
          </Button>
        </div>
      ) : null}
      {canManage ? (
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={loading || busy || !data?.items.some(allowed)}
            onClick={() =>
              setSelection((data?.items ?? []).filter(allowed).map((row) => row.catalogAccountId!))
            }
          >
            Välj tillåtna på sidan
          </Button>
          <Button
            type="button"
            disabled={!selection.length || busy || loading}
            onClick={() =>
              void act(async (signal) => {
                const result = await workspaceRequest<ActivationPreview>(
                  "/accounts/catalog/activation-preview",
                  {
                    method: "POST",
                    signal,
                    body: JSON.stringify({ organizationId: org, catalogAccountIds: selection })
                  }
                );
                if (!signal.aborted) setPreview(result);
              })
            }
          >
            Lägg till markerade ({selection.length})
          </Button>
        </div>
      ) : null}
      {loading ? (
        <LoadingState label="Hämtar kontoplan…" />
      ) : !error && data?.items.length ? (
        grouped ? (
          <div>
            {[...groups].map(([group, items]) => (
              <details key={group} open className="border border-border">
                <summary className="p-3">
                  Kontoklass {group.slice(0, 1)} · {items[0]?.className ?? "Egna konton"} / {group}{" "}
                  · {items[0]?.groupName ?? "Egna konton"} · {items.length} på denna sida
                </summary>
                {table(items)}
              </details>
            ))}
          </div>
        ) : (
          table(data.items)
        )
      ) : !error ? (
        <EmptyState
          title="Inga konton matchar din sökning."
          description={data?.blockedReason ?? "Prova ett annat filter."}
        />
      ) : null}
      {data ? (
        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => {
              setPage((v) => v - 1);
              setSelection([]);
            }}
          >
            Föregående
          </Button>
          <span>
            Sida {page} · {data.total} träffar
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page * data.pageSize >= data.total || loading}
            onClick={() => {
              setPage((v) => v + 1);
              setSelection([]);
            }}
          >
            Nästa
          </Button>
        </div>
      ) : null}
      {!canManage ? <p>Du har läsbehörighet till kontoplanen.</p> : null}
      <p className="text-xs text-muted">
        Konton delas mellan företagets räkenskapsår. BAS anger inte dina momsinställningar. Endast
        aktiva, tillåtna konton kan väljas för ny bokföring.
      </p>
      {editor ? (
        <AccountEditor
          key={editor.account?.id ?? "new"}
          account={editor.account}
          organizationId={org}
          organizationName={name}
          onCancel={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            reload();
          }}
        />
      ) : null}
      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        title="Bekräfta BAS-aktivering"
        busy={busy}
      >
        {preview ? (
          <>
            <div className="dialog-body">
              <p>
                Markerade: {preview.selected} · Redan aktiva: {preview.alreadyActive} · Kan läggas
                till: {preview.canAdd} · Inte tillåtna: {preview.notAllowed}
              </p>
              <ul>
                {preview.rows.map((row) => (
                  <li key={row.id}>
                    {row.number} {row.name} ·{" "}
                    {row.reason ?? (row.alreadyActive ? "Redan aktivt" : "Kan läggas till")}
                  </li>
                ))}
              </ul>
              <p>
                Inga konton har lagts till ännu. Hela urvalet måste vara tillåtet; befintliga namn
                och momsinställningar bevaras.
              </p>
              {error ? <p role="alert">{error}</p> : null}
            </div>
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Avbryt
              </Button>
              <Button
                type="button"
                disabled={busy || !!preview.notAllowed || !preview.canAdd}
                onClick={() =>
                  void act(async (signal) => {
                    const result = await workspaceRequest<{ activated: number }>(
                      "/accounts/catalog/activate",
                      {
                        method: "POST",
                        signal,
                        body: JSON.stringify({
                          organizationId: org,
                          catalogAccountIds: preview.rows.map((row) => row.id)
                        })
                      }
                    );
                    if (signal.aborted) return;
                    setNotice(`${result.activated} konton aktiverade.`);
                    reload();
                  })
                }
              >
                Bekräfta aktivering
              </Button>
            </div>
          </>
        ) : null}
      </Dialog>
      <Dialog
        open={frameworkDialog}
        onClose={() => setFrameworkDialog(false)}
        title="Ändra K-regelverk"
        busy={busy}
      >
        <div className="dialog-body space-y-3">
          <p>
            Begränsade konton kräver uttryckligen K3. Byte tillbaka kan kräva avstämning av aktiva
            konton och historik. Historiken skrivs aldrig om.
          </p>
          <label>
            Regelverk
            <select
              className={`${control} block`}
              value={framework}
              onChange={(e) => setFramework(e.target.value)}
            >
              <option value="NOT_CONFIGURED">Ej konfigurerat</option>
              <option value="K2">K2</option>
              <option value="K3">K3</option>
            </select>
          </label>
          <label>
            Skriv företagsnamnet {name}
            <input
              className={`${control} block`}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
        </div>
        <div className="dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setFrameworkDialog(false)}
          >
            Avbryt
          </Button>
          <Button
            type="button"
            disabled={busy || confirmation !== name}
            onClick={() =>
              void act(async (signal) => {
                await workspaceRequest("/accounts/catalog/framework", {
                  method: "POST",
                  signal,
                  body: JSON.stringify({ organizationId: org, framework, confirmation })
                });
                if (signal.aborted) return;
                setFrameworkDialog(false);
                reload();
              })
            }
          >
            Bekräfta K-regelverk
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

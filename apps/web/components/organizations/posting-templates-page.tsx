"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { workspaceRequest } from "@/lib/workspace-api";
import {
  AccountTypeahead,
  type AccountChoice
} from "@/components/journal-entries/account-typeahead";
import { DimensionTypeahead } from "@/components/journal-entries/dimension-typeahead";
import type { Dimension } from "./dimensions-page";
interface TemplateLine {
  accountId: string;
  side: "DEBIT" | "CREDIT";
  amount: string | null;
  description: string | null;
  account: { id: string; accountNumber: string; name: string };
  project: Dimension | null;
  costCenter: Dimension | null;
}
interface Template {
  id: string;
  code: string;
  name: string;
  description: string | null;
  defaultText: string | null;
  voucherSeriesCode: string | null;
  isActive: boolean;
  lines: TemplateLine[];
}
interface Row {
  key: string;
  account: AccountChoice | null;
  side: "DEBIT" | "CREDIT";
  amount: string;
  description: string;
  projectCode: string;
  costCenterCode: string;
}
const blank = (): Row => ({
  key: crypto.randomUUID(),
  account: null,
  side: "DEBIT",
  amount: "",
  description: "",
  projectCode: "",
  costCenterCode: ""
});
export function PostingTemplatesPage() {
  const { activeOrganization } = useAuth();
  if (!activeOrganization) return <p>Välj organisation.</p>;
  return (
    <Register
      key={activeOrganization.id}
      org={activeOrganization.id}
      role={activeOrganization.role}
    />
  );
}
function Register({ org, role }: { org: string; role: string }) {
  const [templates, setTemplates] = useState<Template[]>([]),
    [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Template | null>(null),
    [editorKey, setEditorKey] = useState(0);
  const [rows, setRows] = useState<Row[]>(() => [blank(), blank()]);
  const [projects, setProjects] = useState<Dimension[]>([]),
    [centers, setCenters] = useState<Dimension[]>([]);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const mounted = useRef(true),
    inFlight = useRef(false);
  const canWrite = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(role);
  const base = `/organizations/${org}/posting-templates`;
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    Promise.all([
      workspaceRequest<Template[]>(`${base}?${new URLSearchParams({ search })}`, {
        signal: controller.signal
      }),
      workspaceRequest<Dimension[]>(`/organizations/${org}/projects`, {
        signal: controller.signal
      }),
      workspaceRequest<Dimension[]>(`/organizations/${org}/cost-centers`, {
        signal: controller.signal
      })
    ])
      .then(([templates, projects, centers]) => {
        if (!controller.signal.aborted) {
          setTemplates(templates);
          setProjects(projects);
          setCenters(centers);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage("Kunde inte läsa mallregistret.");
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [base, org, search]);
  function edit(template: Template | null, duplicate = false) {
    setEditing(
      template
        ? {
            ...template,
            ...(duplicate
              ? {
                  id: "",
                  code: `${template.code.slice(0, 30)}_KOPIA`,
                  name: `${template.name.slice(0, 140)} (kopia)`,
                  isActive: true
                }
              : {})
          }
        : null
    );
    setRows(
      template
        ? template.lines.map((line) => ({
            key: crypto.randomUUID(),
            account: {
              id: line.account.id,
              number: line.account.accountNumber,
              name: line.account.name
            },
            side: line.side,
            amount: line.amount ?? "",
            description: line.description ?? "",
            projectCode: line.project?.code ?? "",
            costCenterCode: line.costCenter?.code ?? ""
          }))
        : [blank(), blank()]
    );
    setEditorKey((key) => key + 1);
  }
  function change(key: string, patch: Partial<Row>) {
    setRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const lines = rows.map((row) => {
        if (!row.account) throw new Error("Välj ett konto på varje rad.");
        const project = projects.find((item) => item.code === row.projectCode),
          center = centers.find((item) => item.code === row.costCenterCode);
        if ((row.projectCode && !project) || (row.costCenterCode && !center))
          throw new Error("Välj ett aktivt projekt och kostnadsställe.");
        return {
          accountId: row.account.id,
          side: row.side,
          amount: row.amount || null,
          description: row.description,
          projectId: project?.id ?? null,
          costCenterId: center?.id ?? null
        };
      });
      await workspaceRequest(`${base}${editing?.id ? `/${editing.id}` : ""}`, {
        method: editing?.id ? "PATCH" : "POST",
        body: JSON.stringify({
          code: form.get("code"),
          name: form.get("name"),
          description: form.get("description"),
          defaultText: form.get("defaultText"),
          voucherSeriesCode: form.get("series") || null,
          isActive: form.get("active") === "on",
          lines
        })
      });
      const fresh = await workspaceRequest<Template[]>(
        `${base}?${new URLSearchParams({ search })}`
      );
      if (mounted.current) {
        setTemplates(fresh);
        edit(null);
        setMessage("Konteringsmall sparad.");
      }
    } catch (error) {
      if (mounted.current)
        setMessage(error instanceof Error ? error.message : "Kunde inte spara mallen.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="rounded-xl bg-white p-6">
      <h1 className="text-2xl font-semibold">Konteringsmallar</h1>
      <p className="my-3">
        Återanvänd rader, inte bokföringsbeslut. Tomt belopp fylls i på verifikationen. Ingen
        automatisk balanseringsrad skapas.
      </p>
      <label>
        Sök mall{" "}
        <input
          className="m-2 border p-2"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <p role="status">{message}</p>
      <table className="my-4 w-full text-left">
        <thead>
          <tr>
            <th>Kod</th>
            <th>Namn</th>
            <th>Status</th>
            <th>Åtgärder</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((template) => (
            <tr key={template.id} className="border-t">
              <td>{template.code}</td>
              <td>{template.name}</td>
              <td>{template.isActive ? "Aktiv" : "Inaktiv"}</td>
              <td>
                {canWrite && (
                  <>
                    <button className="p-2" onClick={() => edit(template)}>
                      Redigera
                    </button>
                    <button className="p-2" onClick={() => edit(template, true)}>
                      Duplicera
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && (
        <form key={editorKey} onSubmit={save}>
          <h2>{editing?.id ? "Redigera mall" : "Skapa mall"}</h2>
          <fieldset disabled={busy} className="space-y-3">
            <label className="block">
              Mallkod{" "}
              <input
                name="code"
                className="border p-2"
                required
                pattern="[A-Z0-9_-]{1,40}"
                defaultValue={editing?.code ?? ""}
              />
            </label>
            <label className="block">
              Mallnamn{" "}
              <input
                name="name"
                className="border p-2"
                required
                maxLength={160}
                defaultValue={editing?.name ?? ""}
              />
            </label>
            <label className="block">
              Beskrivning{" "}
              <input
                name="description"
                className="border p-2"
                maxLength={500}
                defaultValue={editing?.description ?? ""}
              />
            </label>
            <label className="block">
              Verifikationstext{" "}
              <input
                name="defaultText"
                className="border p-2"
                maxLength={500}
                defaultValue={editing?.defaultText ?? ""}
              />
            </label>
            <label className="block">
              Önskad serie (kod){" "}
              <input
                name="series"
                className="border p-2"
                pattern="[A-Z0-9_-]{1,16}"
                defaultValue={editing?.voucherSeriesCode ?? ""}
              />
            </label>
            <label className="block">
              <input name="active" type="checkbox" defaultChecked={editing?.isActive ?? true} />{" "}
              Aktiv mall
            </label>
            {rows.map((row, index) => (
              <div
                key={row.key}
                className="flex flex-wrap items-center gap-2 rounded border p-3"
                role="group"
                aria-label={`Mallrad ${index + 1}`}
              >
                <label htmlFor={`template-account-${row.key}`}>Konto {index + 1}</label>
                <AccountTypeahead
                  id={`template-account-${row.key}`}
                  account={row.account}
                  organizationId={org}
                  onChange={(account) => change(row.key, { account })}
                />
                <label>
                  Sida{" "}
                  <select
                    aria-label="Sida"
                    value={row.side}
                    onChange={(event) =>
                      change(row.key, { side: event.target.value as Row["side"] })
                    }
                  >
                    <option>DEBIT</option>
                    <option>CREDIT</option>
                  </select>
                </label>
                <label>
                  Fast belopp{" "}
                  <input
                    className="w-28 border p-2"
                    inputMode="decimal"
                    pattern="[0-9]{1,16}(\.[0-9]{1,2})?"
                    value={row.amount}
                    onChange={(event) => change(row.key, { amount: event.target.value })}
                  />
                </label>
                <label>
                  Radtext{" "}
                  <input
                    className="border p-2"
                    maxLength={500}
                    value={row.description}
                    onChange={(event) => change(row.key, { description: event.target.value })}
                  />
                </label>
                <DimensionTypeahead
                  org={org}
                  kind="projects"
                  value={row.projectCode}
                  disabled={busy}
                  label={`Projekt ${index + 1}`}
                  onChange={(projectCode) => change(row.key, { projectCode })}
                />
                <DimensionTypeahead
                  org={org}
                  kind="cost-centers"
                  value={row.costCenterCode}
                  disabled={busy}
                  label={`Kostnadsställe ${index + 1}`}
                  onChange={(costCenterCode) => change(row.key, { costCenterCode })}
                />
                <button
                  type="button"
                  disabled={rows.length <= 2}
                  onClick={() => setRows((rows) => rows.filter((item) => item.key !== row.key))}
                >
                  Ta bort rad {index + 1}
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={rows.length >= 100}
              className="mr-3 border p-2"
              onClick={() => setRows((rows) => [...rows, blank()])}
            >
              Lägg till mallrad
            </button>
            <button className="rounded bg-[#17384b] p-3 text-white">Spara mall</button>
            <button type="button" className="ml-3" onClick={() => edit(null)}>
              Ny mall / avbryt
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}

"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { workspaceRequest } from "@/lib/workspace-api";
export interface Dimension {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
}
export function DimensionsPage({ kind }: { kind: "projects" | "cost-centers" }) {
  const { activeOrganization } = useAuth();
  if (!activeOrganization) return <p>Välj organisation.</p>;
  return (
    <DimensionRegister
      key={`${activeOrganization.id}:${kind}`}
      org={activeOrganization.id}
      role={activeOrganization.role}
      kind={kind}
    />
  );
}
function DimensionRegister({
  org,
  role,
  kind
}: {
  org: string;
  role: string;
  kind: "projects" | "cost-centers";
}) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Dimension[]>([]);
  const [editing, setEditing] = useState<Dimension | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canWrite = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(role);
  const base = `/organizations/${org}/${kind}`;
  useEffect(() => {
    const controller = new AbortController();
    workspaceRequest<Dimension[]>(`${base}?${new URLSearchParams({ search })}`, {
      signal: controller.signal
    })
      .then((rows) => {
        if (!controller.signal.aborted) setRows(rows);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      });
    return () => controller.abort();
  }, [base, search]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      await workspaceRequest(`${base}${editing ? `/${editing.id}` : ""}`, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          code: form.get("code"),
          name: form.get("name"),
          description: form.get("description"),
          ...(editing ? { isActive: form.get("active") === "on" } : {})
        })
      });
      setRows(await workspaceRequest<Dimension[]>(`${base}?${new URLSearchParams({ search })}`));
      setEditing(null);
      setMessage("Registerpost sparad.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunde inte spara.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl bg-white p-6">
      <h1 className="text-2xl font-semibold">
        {kind === "projects" ? "Projekt" : "Kostnadsställen"}
      </h1>
      <p className="my-3">
        Koden låses efter bokföring. Inaktiva objekt finns kvar i historiken men kan inte användas
        på nya rader.
      </p>
      <label>
        Sök kod eller namn
        <input
          className="m-3 border p-2"
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
            <th>Åtgärd</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t">
              <td>{row.code}</td>
              <td className="p-3">{row.name}</td>
              <td>{row.isActive ? "Aktiv" : "Inaktiv"}</td>
              <td>{canWrite && <button onClick={() => setEditing(row)}>Redigera</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && (
        <form key={editing?.id ?? "new"} onSubmit={save} className="space-y-3">
          <h2 className="text-lg font-semibold">{editing ? "Redigera" : "Skapa ny"}</h2>
          <fieldset disabled={busy} className="space-y-3">
            <label className="block">
              Kod
              <input
                name="code"
                className="ml-3 border p-2"
                required
                pattern="[A-Za-z0-9_-]{1,32}"
                defaultValue={editing?.code ?? ""}
              />
            </label>
            <label className="block">
              Namn
              <input
                name="name"
                className="ml-3 border p-2"
                required
                maxLength={160}
                defaultValue={editing?.name ?? ""}
              />
            </label>
            <label className="block">
              Beskrivning
              <input
                name="description"
                className="ml-3 border p-2"
                maxLength={500}
                defaultValue={editing?.description ?? ""}
              />
            </label>
            {editing && (
              <label className="block">
                <input type="checkbox" name="active" defaultChecked={editing.isActive} /> Aktiv
              </label>
            )}
            <button className="rounded bg-[#17384b] p-3 text-white">Spara registerpost</button>
            {editing && (
              <button type="button" className="ml-3" onClick={() => setEditing(null)}>
                Avbryt
              </button>
            )}
          </fieldset>
        </form>
      )}
    </section>
  );
}

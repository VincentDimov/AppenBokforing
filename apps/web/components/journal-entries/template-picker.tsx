"use client";
import { useEffect, useRef, useState } from "react";
import { workspaceRequest } from "@/lib/workspace-api";
import type { AccountChoice } from "./account-typeahead";
export interface TemplateDraft {
  description: string;
  voucherSeriesCode: string | null;
  lines: {
    account: AccountChoice;
    description: string;
    debit: string;
    credit: string;
    projectCode: string;
    costCenterCode: string;
  }[];
}
export function TemplatePicker({
  org,
  disabled,
  onApply
}: {
  org: string;
  disabled: boolean;
  onApply: (draft: TemplateDraft) => void;
}) {
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [id, setId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    workspaceRequest<{ id: string; name: string }[]>(
      `/organizations/${org}/posting-templates?activeOnly=true`,
      { signal: controller.signal }
    )
      .then((rows) => {
        if (!Array.isArray(rows)) throw new Error("Invalid template list response.");
        if (!controller.signal.aborted) setTemplates(rows);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage("Kunde inte läsa konteringsmallar.");
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [org]);
  async function apply() {
    if (inFlight.current || disabled || !id || !confirmed) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const draft = await workspaceRequest<TemplateDraft>(
        `/organizations/${org}/posting-templates/${id}/apply`,
        { method: "POST" }
      );
      if (mounted.current) onApply(draft);
    } catch (error) {
      if (mounted.current)
        setMessage(error instanceof Error ? error.message : "Kunde inte använda mallen.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <fieldset className="my-4 rounded border bg-white p-4" disabled={disabled || busy}>
      <legend>Använd konteringsmall</legend>
      <label>
        Mall{" "}
        <select
          aria-label="Mall"
          value={id}
          onChange={(event) => setId(event.target.value)}
          className="m-2 border p-2"
        >
          <option value="">Välj mall</option>
          {templates.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mr-3">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />{" "}
        Ersätt raderna i utkastet
      </label>
      <button
        type="button"
        disabled={!id || !confirmed}
        onClick={() => void apply()}
        className="rounded border p-2"
      >
        Använd mall
      </button>
      {message && <p role="alert">{message}</p>}
      <p className="text-sm">
        Raderna kopieras. Kontrollera belopp och metadata innan du sparar och bokför.
      </p>
    </fieldset>
  );
}

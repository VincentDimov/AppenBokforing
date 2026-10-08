"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  accountTypeLabels,
  createAccount,
  type Account,
  type AccountInput,
  type AccountType,
  AccountsApiError,
  updateAccount
} from "@/lib/api/accounts";

interface AccountEditorProps {
  account: Account | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  organizationId: string;
  organizationName: string;
}

interface AccountFormState {
  accountType: AccountType;
  active: boolean;
  description: string;
  name: string;
  number: string;
  vatCode: string;
}

const accountTypeOptions: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

export function AccountEditor({
  account,
  onCancel,
  onSaved,
  organizationId,
  organizationName
}: Readonly<AccountEditorProps>) {
  const [form, setForm] = useState<AccountFormState>(() => toFormState(account));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  const isEditing = account !== null;

  useEffect(() => {
    setForm(toFormState(account));
    setError(null);
  }, [account]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setError(null);

    if (!/^\d{1,16}$/.test(form.number.trim())) {
      setError("Kontonumret ska innehålla 1–16 siffror.");
      return;
    }

    if (!form.name.trim()) {
      setError("Ange ett kontonamn.");
      return;
    }

    inFlight.current = true;
    setIsSaving(true);

    try {
      const input = toAccountInput(form);

      if (account) {
        await updateAccount(account.id, input);
      } else {
        await createAccount(organizationId, input);
      }

      await onSaved();
    } catch (caughtError) {
      setError(
        caughtError instanceof AccountsApiError
          ? caughtError.message
          : "Kunde inte spara kontot. Försök igen."
      );
    } finally {
      inFlight.current = false;
      setIsSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="account-editor-title"
      className="border border-border bg-white p-5 shadow-none sm:p-6"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">
            {isEditing ? "Redigera konto" : "Nytt konto"}
          </p>
          <h2
            className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-ink"
            id="account-editor-title"
          >
            {isEditing ? `${account.number} · ${account.name}` : "Lägg till konto"}
          </h2>
          <p className="mt-2 text-sm text-muted">{organizationName}</p>
        </div>
        <Button
          aria-label="Stäng kontoformulär"
          onClick={onCancel}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>

      <form ref={formRef} className="unstyled-form mt-6 space-y-5" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-secondary">
          Kontonummer
          <input
            className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-ink outline-none transition focus:border-border focus:ring-4 focus:ring-focus"
            inputMode="numeric"
            maxLength={16}
            onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))}
            required
            value={form.number}
          />
        </label>

        <label className="block text-sm font-medium text-secondary">
          Kontonamn
          <input
            className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-ink outline-none transition focus:border-border focus:ring-4 focus:ring-focus"
            maxLength={160}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
            value={form.name}
          />
        </label>

        <label className="block text-sm font-medium text-secondary">
          Typ
          <Select
            onValueChange={(value) =>
              setForm((current) => ({ ...current, accountType: value as AccountType }))
            }
            value={form.accountType}
          >
            <SelectTrigger aria-label="Kontotyp" className="mt-2 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accountTypeOptions.map((accountType) => (
                <SelectItem key={accountType} value={accountType}>
                  {accountTypeLabels[accountType]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="block text-sm font-medium text-secondary">
          Momskod <span className="font-normal text-muted">(valfritt)</span>
          <input
            className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2.5 font-mono text-ink uppercase outline-none transition focus:border-border focus:ring-4 focus:ring-focus"
            maxLength={32}
            onChange={(event) =>
              setForm((current) => ({ ...current, vatCode: event.target.value }))
            }
            placeholder="Till exempel MOMS25-UT"
            value={form.vatCode}
          />
          <span className="mt-1.5 block text-xs font-normal leading-5 text-muted">
            Koden måste finnas och vara aktiv i den valda organisationen.
          </span>
        </label>

        <label className="block text-sm font-medium text-secondary">
          Beskrivning <span className="font-normal text-muted">(valfritt)</span>
          <textarea
            className="mt-2 min-h-24 w-full resize-y rounded-lg border border-border bg-white px-3 py-2.5 text-ink outline-none transition focus:border-border focus:ring-4 focus:ring-focus"
            maxLength={500}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            value={form.description}
          />
        </label>

        <label className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-3 py-3 text-sm font-medium text-secondary">
          <input
            checked={form.active}
            className="size-4 accent-[#1f6b86]"
            onChange={(event) =>
              setForm((current) => ({ ...current, active: event.target.checked }))
            }
            type="checkbox"
          />
          Kontot är aktivt
        </label>

        {error ? (
          <p
            aria-live="polite"
            className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm leading-6 text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
          <Button onClick={onCancel} type="button" variant="ghost">
            Avbryt
          </Button>
          <Button disabled={isSaving} type="submit">
            {isSaving ? "Sparar…" : isEditing ? "Spara ändringar" : "Skapa konto"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function toFormState(account: Account | null): AccountFormState {
  return {
    accountType: account?.accountType ?? "ASSET",
    active: account?.active ?? true,
    description: account?.description ?? "",
    name: account?.name ?? "",
    number: account?.number ?? "",
    vatCode: account?.vatCode?.code ?? ""
  };
}

function toAccountInput(form: AccountFormState): AccountInput {
  return {
    accountType: form.accountType,
    active: form.active,
    description: form.description.trim() || null,
    name: form.name.trim(),
    number: form.number.trim(),
    vatCode: form.vatCode.trim().toUpperCase() || null
  };
}

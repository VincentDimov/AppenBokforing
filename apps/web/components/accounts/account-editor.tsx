"use client";

import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

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
  const isEditing = account !== null;

  useEffect(() => {
    setForm(toFormState(account));
    setError(null);
  }, [account]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!/^\d{1,16}$/.test(form.number.trim())) {
      setError("Kontonumret ska innehålla 1–16 siffror.");
      return;
    }

    if (!form.name.trim()) {
      setError("Ange ett kontonamn.");
      return;
    }

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
      setIsSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="account-editor-title"
      className="border border-[#cfdfe6] bg-white p-5 shadow-[0_12px_30px_rgba(16,47,66,0.06)] sm:p-6"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#e2ebef] pb-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-[#638292] uppercase">
            {isEditing ? "Redigera konto" : "Nytt konto"}
          </p>
          <h2
            className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-[#13364a]"
            id="account-editor-title"
          >
            {isEditing ? `${account.number} · ${account.name}` : "Lägg till konto"}
          </h2>
          <p className="mt-2 text-sm text-[#668291]">{organizationName}</p>
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

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-[#27495b]">
          Kontonummer
          <input
            className="mt-2 w-full rounded-lg border border-[#c7d8e0] bg-white px-3 py-2.5 text-[#17384b] outline-none transition focus:border-[#3e85a2] focus:ring-4 focus:ring-[#d8edf5]"
            inputMode="numeric"
            maxLength={16}
            onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))}
            required
            value={form.number}
          />
        </label>

        <label className="block text-sm font-medium text-[#27495b]">
          Kontonamn
          <input
            className="mt-2 w-full rounded-lg border border-[#c7d8e0] bg-white px-3 py-2.5 text-[#17384b] outline-none transition focus:border-[#3e85a2] focus:ring-4 focus:ring-[#d8edf5]"
            maxLength={160}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
            value={form.name}
          />
        </label>

        <label className="block text-sm font-medium text-[#27495b]">
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

        <label className="block text-sm font-medium text-[#27495b]">
          Momskod <span className="font-normal text-[#758e9a]">(valfritt)</span>
          <input
            className="mt-2 w-full rounded-lg border border-[#c7d8e0] bg-white px-3 py-2.5 font-mono text-[#17384b] uppercase outline-none transition focus:border-[#3e85a2] focus:ring-4 focus:ring-[#d8edf5]"
            maxLength={32}
            onChange={(event) =>
              setForm((current) => ({ ...current, vatCode: event.target.value }))
            }
            placeholder="Till exempel MOMS25-UT"
            value={form.vatCode}
          />
          <span className="mt-1.5 block text-xs font-normal leading-5 text-[#758e9a]">
            Koden måste finnas och vara aktiv i den valda organisationen.
          </span>
        </label>

        <label className="block text-sm font-medium text-[#27495b]">
          Beskrivning <span className="font-normal text-[#758e9a]">(valfritt)</span>
          <textarea
            className="mt-2 min-h-24 w-full resize-y rounded-lg border border-[#c7d8e0] bg-white px-3 py-2.5 text-[#17384b] outline-none transition focus:border-[#3e85a2] focus:ring-4 focus:ring-[#d8edf5]"
            maxLength={500}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            value={form.description}
          />
        </label>

        <label className="flex items-center gap-3 rounded-lg border border-[#d9e5ea] bg-[#f7fafb] px-3 py-3 text-sm font-medium text-[#27495b]">
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
            className="rounded-lg bg-[#fff0ed] px-3 py-2.5 text-sm leading-6 text-[#9c3127]"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3 border-t border-[#e2ebef] pt-5">
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

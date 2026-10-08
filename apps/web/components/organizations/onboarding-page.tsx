"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/workspace";
import { useAuth } from "@/components/auth/auth-provider";
import { workspaceRequest } from "@/lib/workspace-api";

export function OnboardingPage() {
  const { refresh } = useAuth();
  const router = useRouter();
  const setupKey = useRef<string>("");
  const inFlight = useRef(false);
  const year = new Date().getFullYear();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      setupKey.current ||= crypto.randomUUID();
      const result = await workspaceRequest<{ organization: { id: string } }>("/onboarding", {
        method: "POST",
        body: JSON.stringify({
          setupKey: setupKey.current,
          name: form.get("name"),
          organizationNumber: form.get("organizationNumber") || undefined,
          address: form.get("address") || undefined,
          countryCode: "SE",
          defaultCurrency: "SEK",
          startDate: form.get("startDate"),
          endDate: form.get("endDate")
        })
      });
      localStorage.setItem("ledgerapp:active-organization", result.organization.id);
      await refresh();
      router.replace("/app");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Kunde inte skapa arbetsytan.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5">
      <PageHeader
        title="Välkommen till din arbetsyta"
        context="Kom igång · Företag och räkenskapsår"
      />
      <p className="my-4">
        Skapa organisation och första räkenskapsår. En liten egen startkontoplan och serie A skapas
        samtidigt. Den är inte en full BAS-kontoplan eller färdig momsinställning.
      </p>
      <form className="space-y-4" onSubmit={submit} aria-busy={busy}>
        <label className="block">
          Företagsnamn
          <input className="block w-full rounded border p-2" name="name" required maxLength={160} />
        </label>
        <label className="block">
          Organisationsnummer
          <input
            className="block w-full rounded border p-2"
            name="organizationNumber"
            pattern="[0-9]{6}-?[0-9]{4}"
            placeholder="559999-0001"
          />
        </label>
        <p className="text-sm">
          Endast formatkontroll, ingen kontroll mot Bolagsverket. Sverige · SEK.
        </p>
        <label className="block">
          Adress
          <input className="block w-full rounded border p-2" name="address" maxLength={500} />
        </label>
        <label className="block">
          Räkenskapsårets start
          <input
            className="block rounded border p-2"
            type="date"
            name="startDate"
            defaultValue={`${year}-01-01`}
            required
          />
        </label>
        <label className="block">
          Räkenskapsårets slut
          <input
            className="block rounded border p-2"
            type="date"
            name="endDate"
            defaultValue={`${year}-12-31`}
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="rounded bg-accent px-5 py-3 text-white" disabled={busy}>
          {busy ? "Skapar…" : "Skapa arbetsyta"}
        </button>
      </form>
    </section>
  );
}

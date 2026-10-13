"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Feedback, PageHeader, Panel } from "@/components/ui/workspace";
import { workspaceRequest } from "@/lib/workspace-api";
import { useAdminData } from "@/lib/platform-admin";
import { AdminResult } from "./admin-shared";

export function PasswordChangeForm() {
  const router = useRouter();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await workspaceRequest("/auth/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: form.get("currentPassword"),
          newPassword: form.get("newPassword")
        })
      });
      router.replace("/login");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Lösenordet kunde inte ändras.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Panel>
      <h2 className="mb-3 text-lg font-semibold">Byt ditt lösenord</h2>
      <p className="mb-5 text-sm text-muted">
        Minst 14 tecken, stora och små bokstäver samt siffror. Alla sessioner avslutas och du loggar
        in igen.
      </p>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm">
          Nuvarande lösenord
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            className="mt-2 block w-full rounded border p-3"
          />
        </label>
        <label className="block text-sm">
          Nytt lösenord
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={14}
            maxLength={128}
            className="mt-2 block w-full rounded border p-3"
          />
        </label>
        {error && <Feedback kind="error">{error}</Feedback>}
        <Button type="submit" disabled={busy}>
          {busy ? "Sparar…" : "Byt lösenord och logga in igen"}
        </Button>
      </form>
    </Panel>
  );
}
export function AdminSecuritySetup() {
  const state = useAdminData<{ mustChangePassword: boolean }>("/security-setup/status");
  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Administratörens lösenord"
        context="Master Admin · Konto"
        description="Byt ditt lösenord. Inloggning och aktiva plattformsbehörigheter krävs för administration."
      />
      <AdminResult loading={state.loading} error={state.error} retry={state.reload}>
        {state.data ? (
          <>
            {state.data.mustChangePassword ? (
              <Feedback kind="warning">Byt ditt initiala lösenord före administration.</Feedback>
            ) : (
              <Link href="/app" className="text-sm underline">
                Till översikt
              </Link>
            )}
            <PasswordChangeForm />
          </>
        ) : null}
      </AdminResult>
    </section>
  );
}

"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Feedback, PageHeader, Panel } from "@/components/ui/workspace";
import { workspaceRequest } from "@/lib/workspace-api";
import { adminRequest, useAdminData } from "@/lib/platform-admin";
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
  const { refresh } = useAuth();
  const router = useRouter();
  const state = useAdminData<{
    mustChangePassword: boolean;
    mfaEnrolled: boolean;
    mfaConfigured: boolean;
    mfaVerifiedAt: string | null;
  }>("/security-setup/status");
  const [secret, setSecret] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [showSecret, setShowSecret] = useState(false),
    [recover, setRecover] = useState(false);
  const inFlight = useRef(false);
  async function enroll() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await adminRequest<{ secret: string }>("/security-setup/enroll", {
        method: "POST"
      });
      setSecret(result.secret);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Registrering misslyckades.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (recover) {
        await adminRequest("/security-setup/recover", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: form.get("currentPassword"),
            recoveryCode: form.get("recoveryCode")
          })
        });
        setSecret("");
        router.replace("/login");
      } else {
        const result = await adminRequest<{ recoveryCodes?: string[] }>("/security-setup/verify", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: form.get("currentPassword"),
            code: form.get("code")
          })
        });
        setSecret("");
        if (result.recoveryCodes) setCodes(result.recoveryCodes);
        else {
          await refresh();
          router.replace("/app");
        }
        state.reload();
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Säkerhetskontrollen misslyckades.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Administratörens säkerhet"
        context="Master Admin · Obligatoriskt skydd"
        description="Lösenordsbyte, MFA och ny verifiering före känsliga åtgärder."
      />
      <AdminResult loading={state.loading} error={state.error} retry={state.reload}>
        {state.data?.mustChangePassword ? (
          <PasswordChangeForm />
        ) : (
          <>
            {!state.data?.mfaConfigured && (
              <Feedback kind="warning">
                MFA-krypteringsnyckel är inte konfigurerad på servern. Administration är spärrad
                tills operatören konfigurerat den.
              </Feedback>
            )}
            {codes.length > 0 ? (
              <Panel>
                <h2 className="font-semibold">Spara dina engångskoder säkert</h2>
                <p className="my-3 text-sm text-muted">
                  Visas endast nu. Dela eller fotografera dem inte. Återställning avslutar alla
                  sessioner och kräver nytt lösenord samt ny MFA-registrering.
                </p>
                <ul className="space-y-2 font-mono text-sm break-all">
                  {codes.map((code) => (
                    <li key={code}>{code}</li>
                  ))}
                </ul>
                <Button
                  className="mt-5"
                  onClick={async () => {
                    setCodes([]);
                    await refresh();
                    router.replace("/app");
                  }}
                >
                  Jag har sparat koderna – till översikt
                </Button>
              </Panel>
            ) : (
              <Panel>
                <h2 className="mb-3 font-semibold">
                  {recover
                    ? "Säker återställning"
                    : state.data?.mfaEnrolled
                      ? "Verifiera MFA"
                      : "Registrera autentiseringsapp"}
                </h2>
                {!state.data?.mfaEnrolled && !recover && (
                  <>
                    <p className="mb-4 text-sm text-muted">
                      Använd en TOTP-app, 6 siffror, 30 sekunder. Registreringen gäller i 10
                      minuter.
                    </p>
                    <Button
                      disabled={busy || !state.data?.mfaConfigured}
                      onClick={() => void enroll()}
                    >
                      Skapa MFA-registrering
                    </Button>
                    {secret && (
                      <div className="my-4">
                        <label className="block text-sm">
                          MFA-hemlighet
                          <input
                            readOnly
                            type={showSecret ? "text" : "password"}
                            value={secret}
                            autoComplete="off"
                            className="mt-2 w-full rounded border p-3 font-mono"
                          />
                        </label>
                        <Button variant="ghost" onClick={() => setShowSecret((value) => !value)}>
                          {showSecret ? "Dölj" : "Visa för inmatning i din autentiseringsapp"}
                        </Button>
                      </div>
                    )}
                  </>
                )}
                <form className="mt-5 space-y-4" onSubmit={submit}>
                  <label className="block text-sm">
                    Nuvarande lösenord
                    <input
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      required
                      maxLength={128}
                      className="mt-2 w-full rounded border p-3"
                    />
                  </label>
                  {recover ? (
                    <label className="block text-sm">
                      Återställningskod
                      <input
                        name="recoveryCode"
                        required
                        minLength={32}
                        maxLength={32}
                        autoComplete="off"
                        className="mt-2 w-full rounded border p-3"
                      />
                    </label>
                  ) : (
                    <label className="block text-sm">
                      MFA-kod
                      <input
                        name="code"
                        required
                        pattern="[0-9]{6}"
                        maxLength={6}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        className="mt-2 w-full rounded border p-3"
                      />
                    </label>
                  )}
                  <Button type="submit" disabled={busy || (!recover && !state.data?.mfaConfigured)}>
                    {busy
                      ? "Verifierar…"
                      : recover
                        ? "Återställ säkert"
                        : "Verifiera lösenord och MFA"}
                  </Button>
                </form>
                <Button
                  variant="ghost"
                  className="mt-3"
                  onClick={() => setRecover((value) => !value)}
                >
                  {recover ? "Tillbaka till MFA" : "Jag behöver använda en återställningskod"}
                </Button>
              </Panel>
            )}
            {error && <Feedback kind="error">{error}</Feedback>}
          </>
        )}
      </AdminResult>
    </section>
  );
}

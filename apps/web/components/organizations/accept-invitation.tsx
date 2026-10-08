"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PageHeader, LoadingState } from "@/components/ui/workspace";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/auth/auth-provider";
import { workspaceRequest } from "@/lib/workspace-api";
export function AcceptInvitation() {
  return (
    <AuthProvider>
      <AcceptForm />
    </AuthProvider>
  );
}
function AcceptForm() {
  const { status, user, refresh } = useAuth();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    const candidate = location.hash.slice(1);
    if (/^[A-Za-z0-9_-]{43}$/.test(candidate)) setToken(candidate);
  }, []);
  async function accept() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await workspaceRequest<{ organizationId: string }>("/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token })
      });
      localStorage.setItem("ledgerapp:active-organization", response.organizationId);
      await refresh();
      location.hash = "";
      router.replace("/app");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunde inte acceptera inbjudan.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-xl rounded-lg border border-border bg-white p-6 sm:p-8">
      <PageHeader
        title="Acceptera inbjudan"
        context="Företagsåtkomst"
        description="Anslut med den e-postadress som inbjudan skickades till."
      />
      {!token ? (
        <p>Inbjudningslänk saknas eller är ogiltig.</p>
      ) : status === "anonymous" ? (
        <p className="my-4">
          Logga in eller skapa konto med den inbjudna e-postadressen.{" "}
          <Link href={`/login#invitation=${token}`}>Logga in</Link> ·{" "}
          <Link href={`/register#invitation=${token}`}>Registrera dig</Link>
        </p>
      ) : status === "authenticated" ? (
        <>
          <p className="my-4">
            Du är inloggad som {user?.email}. E-postadressen måste matcha inbjudan.
          </p>
          <Button disabled={busy} onClick={() => void accept()}>
            Acceptera inbjudan
          </Button>
        </>
      ) : (
        <LoadingState
          label={
            status === "error"
              ? "Kunde inte kontrollera sessionen. Ladda om sidan."
              : "Kontrollerar session…"
          }
        />
      )}
      <p role="alert">{message}</p>
    </section>
  );
}

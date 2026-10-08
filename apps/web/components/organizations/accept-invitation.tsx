"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
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
  useEffect(() => {
    const candidate = location.hash.slice(1);
    if (/^[A-Za-z0-9_-]{43}$/.test(candidate)) setToken(candidate);
  }, []);
  async function accept() {
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
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-xl rounded-xl bg-white p-8">
      <h1 className="text-2xl font-semibold">Acceptera inbjudan</h1>
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
          <button
            className="rounded bg-[#17384b] p-3 text-white"
            disabled={busy}
            onClick={() => void accept()}
          >
            Acceptera inbjudan
          </button>
        </>
      ) : (
        <p>
          {status === "error"
            ? "Kunde inte kontrollera sessionen. Ladda om sidan."
            : "Kontrollerar session…"}
        </p>
      )}
      <p role="alert">{message}</p>
    </section>
  );
}

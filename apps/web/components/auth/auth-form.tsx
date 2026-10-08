"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

type AuthMode = "login" | "register";

interface AuthFormProps {
  mode: AuthMode;
}

function getErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("message" in payload)) {
    return "Något gick fel. Försök igen.";
  }

  const message = payload.message;

  return Array.isArray(message)
    ? message.filter((item): item is string => typeof item === "string").join(" ")
    : typeof message === "string"
      ? message
      : "Något gick fel. Försök igen.";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invitationToken, setInvitationToken] = useState("");
  useEffect(() => {
    const candidate = location.hash.replace(/^#invitation=/, "");
    if (/^[A-Za-z0-9_-]{43}$/.test(candidate)) setInvitationToken(candidate);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        body: JSON.stringify(isRegister ? { displayName, email, password } : { email, password }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });

      if (!response.ok) {
        let payload: unknown;

        try {
          payload = await response.json();
        } catch {
          payload = undefined;
        }

        setError(
          response.status === 429
            ? "För många försök. Vänta en stund och försök igen."
            : getErrorMessage(payload)
        );
        return;
      }

      router.replace(invitationToken ? `/invitations/accept#${invitationToken}` : "/app");
      router.refresh();
    } catch {
      setError("Kunde inte ansluta till tjänsten. Försök igen.");
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      {isRegister ? (
        <label className="block text-sm font-medium text-ink">
          Namn
          <input
            autoComplete="name"
            className="mt-2 w-full rounded-lg border border-border bg-white px-3.5 py-3 text-ink outline-none transition focus:border-border focus:ring-4 focus:ring-focus"
            maxLength={160}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            value={displayName}
          />
        </label>
      ) : null}

      <label className="block text-sm font-medium text-ink">
        E-postadress
        <input
          autoComplete="email"
          className="mt-2 w-full rounded-lg border border-border bg-white px-3.5 py-3 text-ink outline-none transition focus:border-border focus:ring-4 focus:ring-focus"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>

      <label className="block text-sm font-medium text-ink">
        Lösenord
        <input
          autoComplete={isRegister ? "new-password" : "current-password"}
          aria-label="Lösenord"
          className="mt-2 w-full rounded-lg border border-border bg-white px-3.5 py-3 text-ink outline-none transition focus:border-border focus:ring-4 focus:ring-focus"
          minLength={isRegister ? 12 : 1}
          onChange={(event) => setPassword(event.target.value)}
          required
          aria-describedby={error ? "auth-error" : isRegister ? "password-help" : undefined}
          aria-invalid={Boolean(error)}
          type={showPassword ? "text" : "password"}
          value={password}
        />
        <button
          type="button"
          className="mt-2 text-xs font-medium text-accent hover:underline"
          aria-pressed={showPassword}
          onClick={() => setShowPassword((value) => !value)}
        >
          {showPassword ? "Dölj lösenord" : "Visa lösenord"}
        </button>
        {isRegister ? (
          <span id="password-help" className="mt-1.5 block text-xs font-normal text-muted">
            Minst 12 tecken.
          </span>
        ) : null}
      </label>

      {error ? (
        <p
          id="auth-error"
          role="alert"
          aria-live="polite"
          className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <button
        className="w-full rounded-lg bg-accent px-4 py-3 font-semibold text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Arbetar…" : isRegister ? "Skapa konto" : "Logga in"}
      </button>

      <p className="text-center text-sm text-muted">
        {isRegister ? "Har du redan ett konto?" : "Saknar du ett konto?"}{" "}
        <Link
          className="font-semibold text-secondary hover:underline"
          href={`${isRegister ? "/login" : "/register"}${invitationToken ? `#invitation=${invitationToken}` : ""}`}
        >
          {isRegister ? "Logga in" : "Registrera dig"}
        </Link>
      </p>
    </form>
  );
}

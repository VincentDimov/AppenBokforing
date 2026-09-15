"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

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
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

        setError(getErrorMessage(payload));
        return;
      }

      router.replace("/app");
      router.refresh();
    } catch {
      setError("Kunde inte ansluta till tjänsten. Försök igen.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      {isRegister ? (
        <label className="block text-sm font-medium text-[#294942]">
          Namn
          <input
            autoComplete="name"
            className="mt-2 w-full rounded-xl border border-[#cbdcd3] bg-white px-3.5 py-3 text-[#183532] outline-none transition focus:border-[#26725f] focus:ring-4 focus:ring-[#cde7da]"
            maxLength={160}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            value={displayName}
          />
        </label>
      ) : null}

      <label className="block text-sm font-medium text-[#294942]">
        E-postadress
        <input
          autoComplete="email"
          className="mt-2 w-full rounded-xl border border-[#cbdcd3] bg-white px-3.5 py-3 text-[#183532] outline-none transition focus:border-[#26725f] focus:ring-4 focus:ring-[#cde7da]"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>

      <label className="block text-sm font-medium text-[#294942]">
        Lösenord
        <input
          autoComplete={isRegister ? "new-password" : "current-password"}
          className="mt-2 w-full rounded-xl border border-[#cbdcd3] bg-white px-3.5 py-3 text-[#183532] outline-none transition focus:border-[#26725f] focus:ring-4 focus:ring-[#cde7da]"
          minLength={isRegister ? 12 : 1}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        {isRegister ? (
          <span className="mt-1.5 block text-xs font-normal text-[#647b73]">Minst 12 tecken.</span>
        ) : null}
      </label>

      {error ? (
        <p
          aria-live="polite"
          className="rounded-xl bg-[#fff0ed] px-3.5 py-3 text-sm text-[#9c3127]"
        >
          {error}
        </p>
      ) : null}

      <button
        className="w-full rounded-xl bg-[#1d4d46] px-4 py-3 font-semibold text-white transition hover:bg-[#173f39] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Arbetar…" : isRegister ? "Skapa konto" : "Logga in"}
      </button>

      <p className="text-center text-sm text-[#647b73]">
        {isRegister ? "Har du redan ett konto?" : "Saknar du ett konto?"}{" "}
        <Link
          className="font-semibold text-[#1d6557] hover:underline"
          href={isRegister ? "/login" : "/register"}
        >
          {isRegister ? "Logga in" : "Registrera dig"}
        </Link>
      </p>
    </form>
  );
}

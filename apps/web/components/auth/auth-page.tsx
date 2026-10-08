import Link from "next/link";
import { Landmark, Check } from "lucide-react";
import { AuthForm } from "./auth-form";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-ink">
          <Landmark className="size-5 text-accent" aria-hidden="true" />
          LedgerApp
        </Link>
        <Link href="/" className="text-sm text-secondary hover:text-accent">
          Till startsidan
        </Link>
      </header>
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-8 lg:grid-cols-2 lg:pt-16">
        <section className="hidden max-w-md lg:block">
          <p className="text-xs font-semibold text-accent">EN LUGNARE ARBETSYTA</p>
          <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-ink">
            Bokföringen samlad.
            <br />
            Nästa steg tydligt.
          </h2>
          <p className="mt-5 text-base leading-7 text-secondary">
            Från underlag och verifikationer till rapporter och uppföljning, i samma arbetsyta.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-secondary">
            {[
              "Rollstyrd åtkomst till varje företag",
              "Underlag nära verifikationen",
              "Spårbara rättelser av bokförda belopp"
            ].map((text) => (
              <li key={text} className="flex items-center gap-3">
                <Check className="size-4 text-accent" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </section>
        <section className="mx-auto w-full max-w-md rounded-xl border border-border bg-surface p-7 sm:p-9">
          <p className="text-xs font-medium text-muted">
            {mode === "register" ? "DITT PERSONLIGA KONTO" : "DIN ARBETSYTA"}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
            {mode === "register" ? "Skapa ett konto" : "Välkommen tillbaka"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-secondary">
            {mode === "register"
              ? "Skapa din inloggning. Företag och första räkenskapsår lägger du upp i nästa steg."
              : "Logga in för att fortsätta till din arbetsyta."}
          </p>
          <AuthForm mode={mode} />
        </section>
      </div>
    </main>
  );
}

import { AuthForm } from "@/components/auth/auth-form";

export default function RegisterPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_85%_10%,rgba(232,221,190,0.72),transparent_30rem),#f7f7f3] px-5 py-10">
      <section className="w-full max-w-md rounded-[1.75rem] border border-white bg-white/95 p-7 shadow-[0_18px_60px_rgba(26,45,43,0.1)] sm:p-9">
        <p className="text-sm font-semibold tracking-[0.12em] text-[#437363] uppercase">
          LedgerApp
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.055em] text-[#183532]">
          Skapa ett konto
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#60736e]">
          Börja med en säker, personlig inloggning.
        </p>
        <AuthForm mode="register" />
      </section>
    </main>
  );
}

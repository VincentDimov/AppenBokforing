import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileCheck2,
  Landmark,
  LockKeyhole,
  ReceiptText,
  Sparkles
} from "lucide-react";

const benefits = [
  "Tydlig överblick över företagets ekonomi",
  "Verifikationer och underlag på samma ställe",
  "Byggd för svensk bokföring från grunden"
];
const steps = [
  ["01", "Samla", "Lägg in underlag och skapa verifikationer utan omvägar."],
  ["02", "Bokför", "Arbeta tryggt med en tydlig arbetsgång och rätt konton."],
  ["03", "Förstå", "Se resultatet och siffrorna som hjälper dig framåt."]
];

export default function Home() {
  return (
    <main className="overflow-hidden bg-background text-ink">
      <section className="relative isolate min-h-[790px] overflow-hidden bg-surface-muted px-5 pb-16 pt-5 sm:px-8 lg:min-h-[760px] lg:px-12 lg:pt-7">
        <nav className="relative mx-auto flex max-w-7xl items-center justify-between rounded-lg border border-border bg-white px-4 py-3 sm:px-5">
          <Link className="flex items-center gap-2.5 font-semibold tracking-[-0.04em]" href="/">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-accent text-white">
              <Landmark size={19} />
            </span>
            <span className="text-lg">
              ledger<span className="text-secondary">app</span>
            </span>
          </Link>
          <div className="hidden items-center gap-8 text-sm font-medium text-secondary md:flex">
            <a href="#sa-fungerar-det">Så fungerar det</a>
            <a href="#funktioner">Funktioner</a>
            <a href="#tryggt">Tryggt & säkert</a>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <Link className="px-3 py-2 text-sm font-semibold text-ink" href="/login">
              Logga in
            </Link>
            <Link
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-none"
              href="/register"
            >
              Kom igång
            </Link>
          </div>
          <Link
            className="rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold sm:hidden"
            href="/login"
          >
            Logga in
          </Link>
        </nav>
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 pt-18 lg:grid-cols-[1fr_0.88fr] lg:gap-8 lg:pt-26">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white/65 px-3 py-1.5 text-xs font-semibold tracking-wide text-accent">
              <Sparkles size={14} /> BOKFÖRING UTAN BRUS
            </div>
            <h1 className="mt-6 text-[clamp(2.8rem,6vw,5.6rem)] font-semibold leading-[0.91] tracking-[-0.045em] text-ink">
              Mer lugn.
              <br />
              Mindre <span className="text-accent">krångel.</span>
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-8 text-secondary sm:text-xl">
              LedgerApp ger dig en klarare väg från kvitto till insikt. Svensk bokföring, formgiven
              för att vara lätt att göra rätt i.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 font-semibold text-white shadow-none transition hover:-translate-y-0.5"
                href="/register"
              >
                Skapa ett konto <ArrowRight size={17} />
              </Link>
              <a
                className="rounded-full border border-border bg-white/50 px-5 py-3.5 font-semibold text-ink"
                href="#sa-fungerar-det"
              >
                Se hur det fungerar
              </a>
            </div>
            <ul className="mt-9 grid gap-3 text-sm font-medium text-secondary sm:grid-cols-3 sm:gap-2">
              {benefits.map((benefit) => (
                <li className="flex items-start gap-2" key={benefit}>
                  <Check className="mt-0.5 shrink-0 text-accent" size={16} strokeWidth={3} />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
          <DashboardPreview />
        </div>
      </section>
      <section
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-28"
        id="sa-fungerar-det"
      >
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="text-sm font-bold tracking-[0.13em] text-accent uppercase">
              Enklare vardag
            </p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.06em] text-ink sm:text-5xl">
              Siffror ska hjälpa dig att fatta beslut.
            </h2>
          </div>
          <div className="grid gap-7 sm:grid-cols-3">
            {steps.map(([number, title, copy]) => (
              <article className="border-t border-border pt-5" key={number}>
                <p className="text-sm font-semibold text-muted">{number}</p>
                <h3 className="mt-7 text-2xl font-semibold tracking-[-0.05em]">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-secondary">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-sidebar px-5 py-20 text-white sm:px-8 lg:px-12" id="funktioner">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-bold tracking-[0.13em] text-sidebar-muted uppercase">
            Utvecklad för vardagen
          </p>
          <div className="mt-5 grid gap-10 lg:grid-cols-2 lg:items-end">
            <h2 className="max-w-xl text-4xl font-semibold leading-tight tracking-[-0.06em] sm:text-5xl">
              Allt du behöver för att få ett lugnare ekonomiflöde.
            </h2>
            <p className="max-w-md text-lg leading-7 text-sidebar-text">
              Från första underlaget till rapporten du behöver dela – utan att tappa bort
              sammanhanget på vägen.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <Feature
              icon={<ReceiptText />}
              title="Smidiga verifikationer"
              copy="Skapa, spara som utkast och bokför med full kontroll."
            />
            <Feature
              icon={<FileCheck2 />}
              title="Underlag nära till hands"
              copy="Koppla dokument till rätt verifikation när du arbetar."
            />
            <Feature
              icon={<LockKeyhole />}
              title="Trygg historik"
              copy="Ett tydligt spår i bokföringen när något behöver följas upp."
            />
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12" id="tryggt">
        <div className="rounded-lg bg-accent-soft px-7 py-12 sm:px-12 lg:flex lg:items-center lg:justify-between lg:py-16">
          <div>
            <p className="text-sm font-bold tracking-[0.13em] text-accent uppercase">
              Redo när du är
            </p>
            <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.06em] text-ink sm:text-5xl">
              Gör plats för det som faktiskt driver företaget framåt.
            </h2>
          </div>
          <Link
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 font-semibold text-white lg:mt-0"
            href="/register"
          >
            Kom igång med LedgerApp <ArrowRight size={17} />
          </Link>
        </div>
      </section>
      <footer className="border-t border-border px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm text-secondary sm:flex-row">
          <p>© {new Date().getFullYear()} LedgerApp. Svensk bokföring, med lugn i fokus.</p>
          <div className="flex gap-5">
            <Link href="/login">Logga in</Link>
            <Link href="/register">Skapa konto</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function DashboardPreview() {
  return (
    <div
      className="relative mx-auto w-full max-w-[540px] lg:ml-auto"
      aria-label="Illustration med exempeldata"
    >
      <p className="mb-3 text-xs font-medium text-secondary">
        Produktillustration · påhittade exempelbelopp
      </p>

      <div className="relative overflow-hidden rounded-lg border border-white/90 bg-surface p-3 shadow-none sm:p-5">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Översikt
          </div>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
            September 2026
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-surface-muted p-4">
            <p className="text-xs font-medium text-secondary">Resultat hittills</p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.06em]">
              + 48 200 <span className="text-sm">kr</span>
            </p>
            <p className="mt-2 text-xs text-accent">↑ 12,4 % denna månad</p>
          </div>
          <div className="rounded-lg bg-surface-muted p-4">
            <p className="text-xs font-medium text-secondary">Att hantera</p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.06em]">4</p>
            <p className="mt-2 text-xs text-secondary">underlag väntar</p>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Intäkter & kostnader</p>
            <p className="text-xs text-secondary">jan – sep</p>
          </div>
          <div className="mt-6 flex h-28 items-end gap-2">
            {[42, 55, 48, 72, 58, 80, 68, 90, 78].map((height, index) => (
              <div
                className="flex-1 rounded-t-md bg-accent"
                key={index}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-medium text-muted">
            <span>JAN</span>
            <span>MAJ</span>
            <span>SEP</span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-sidebar p-3.5 text-white">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-accent">
            <ReceiptText size={18} />
          </span>
          <div>
            <p className="text-xs text-sidebar-text">Senaste verifikation</p>
            <p className="text-sm font-semibold">A 104 · Kontorsmaterial</p>
          </div>
          <ArrowRight className="ml-auto text-white" size={18} />
        </div>
      </div>
    </div>
  );
}
function Feature({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return (
    <article className="rounded-lg border border-accent bg-sidebar p-6">
      <span className="grid h-11 w-11 place-items-center rounded-md bg-accent text-white">
        {icon}
      </span>
      <h3 className="mt-8 text-xl font-semibold tracking-[-0.04em]">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-sidebar-text">{copy}</p>
    </article>
  );
}

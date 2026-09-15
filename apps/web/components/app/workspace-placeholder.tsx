import { ArrowUpRight, Construction } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { NavigationItem } from "@/lib/app-navigation";

interface WorkspacePlaceholderProps {
  item: NavigationItem;
}

export function WorkspacePlaceholder({ item }: Readonly<WorkspacePlaceholderProps>) {
  return (
    <section className="mx-auto max-w-4xl border border-[#d6e3e9] bg-white p-6 shadow-[0_12px_30px_rgba(16,47,66,0.05)] sm:p-9">
      <div className="flex size-11 items-center justify-center rounded-lg bg-[#e4f1f5] text-[#27627c]">
        <Construction aria-hidden="true" className="size-5" />
      </div>
      <p className="mt-7 text-xs font-semibold tracking-[0.13em] text-[#638292] uppercase">
        Förberedd arbetsyta
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#13364a] sm:text-4xl">
        {item.label}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[#58717e]">{item.description}</p>
      <div className="mt-8 border-l-2 border-[#7fb9d0] bg-[#f1f7f9] px-4 py-4 text-sm leading-6 text-[#466471]">
        Navigeringen och den säkra applikationsytan är på plats. Själva bokförings- och
        rapportfunktionerna ansluts i en kommande fas.
      </div>
      <Button asChild className="mt-8" variant="outline">
        <Link href="/app">
          Till dashboard
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      </Button>
    </section>
  );
}

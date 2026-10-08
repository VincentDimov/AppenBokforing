import { ArrowUpRight, Construction } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { NavigationItem } from "@/lib/app-navigation";

interface WorkspacePlaceholderProps {
  item: NavigationItem;
}

export function WorkspacePlaceholder({ item }: Readonly<WorkspacePlaceholderProps>) {
  return (
    <section className="mx-auto max-w-4xl border border-border bg-white p-6 shadow-none sm:p-9">
      <div className="flex size-11 items-center justify-center rounded-lg bg-accent-soft text-secondary">
        <Construction aria-hidden="true" className="size-5" />
      </div>
      <p className="mt-7 text-xs font-semibold tracking-[0.13em] text-muted uppercase">
        Förberedd arbetsyta
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-ink sm:text-2xl">
        {item.label}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-secondary">{item.description}</p>
      <div className="mt-8 border-l-2 border-border bg-surface-muted px-4 py-4 text-sm leading-6 text-secondary">
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

import { ArrowUpRight, FilePlus2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function QuickActionCard() {
  return (
    <section className="relative overflow-hidden bg-[#12374c] p-6 text-white shadow-[0_16px_32px_rgba(16,47,66,0.16)] sm:p-7">
      <div className="absolute -right-10 -top-12 size-44 rounded-full border border-[#5a91a9]/40" />
      <div className="absolute -bottom-16 right-8 size-32 rounded-full bg-[#255c75]/65" />
      <div className="relative">
        <div className="flex size-10 items-center justify-center rounded-lg bg-[#75b7d0] text-[#0d2c3e]">
          <FilePlus2 aria-hidden="true" className="size-5" />
        </div>
        <p className="mt-8 text-xs font-semibold tracking-[0.13em] text-[#afd1de] uppercase">
          Snabbåtgärd
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Ny verifikation</h2>
        <p className="mt-3 max-w-xs text-sm leading-6 text-[#c7dce5]">
          Skapa ett utkast, kontrollera differensen och bokför när allt balanserar.
        </p>
        <Button
          asChild
          className="mt-7 bg-white text-[#12374c] hover:bg-[#e3f1f5]"
          variant="secondary"
        >
          <Link href="/app/bookkeeping/vouchers/new">
            Skapa verifikation
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

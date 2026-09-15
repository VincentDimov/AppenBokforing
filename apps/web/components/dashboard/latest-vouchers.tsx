import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type LatestVoucher, formatSwedishCurrency } from "@/lib/mock-data/dashboard";

interface LatestVouchersProps {
  currency: string;
  vouchers: LatestVoucher[];
}

export function LatestVouchers({ currency, vouchers }: Readonly<LatestVouchersProps>) {
  return (
    <section className="border border-[#d6e3e9] bg-white shadow-[0_8px_22px_rgba(16,47,66,0.035)]">
      <header className="flex items-start justify-between gap-4 border-b border-[#e1ebef] px-5 py-5 sm:items-center sm:px-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-[#638292] uppercase">
            Senaste aktivitet
          </p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-[#13364a]">
            Senaste verifikationer
          </h2>
        </div>
        <Button asChild className="shrink-0" size="sm" variant="ghost">
          <Link href="/app/bookkeeping/vouchers">
            Visa alla
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Button>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-left text-sm">
          <thead className="border-b border-[#e5edf1] bg-[#f7fafb] text-xs font-semibold tracking-[0.08em] text-[#6c8490] uppercase">
            <tr>
              <th className="px-5 py-3.5 font-semibold sm:px-6">Datum</th>
              <th className="px-5 py-3.5 font-semibold">Verifikation</th>
              <th className="px-5 py-3.5 font-semibold">Beskrivning</th>
              <th className="px-5 py-3.5 text-right font-semibold">Belopp</th>
              <th className="px-5 py-3.5 text-right font-semibold sm:px-6">Status</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((voucher) => (
              <tr className="border-b border-[#edf2f4] last:border-b-0" key={voucher.number}>
                <td className="whitespace-nowrap px-5 py-4 text-[#66808d] sm:px-6">
                  {voucher.date}
                </td>
                <td className="whitespace-nowrap px-5 py-4 font-semibold text-[#1f4960]">
                  {voucher.number}
                </td>
                <td className="max-w-72 truncate px-5 py-4 text-[#466471]">
                  {voucher.description}
                </td>
                <td
                  className={`whitespace-nowrap px-5 py-4 text-right font-medium ${
                    voucher.amount < 0 ? "text-[#8c5144]" : "text-[#1c654a]"
                  }`}
                >
                  {formatSwedishCurrency(voucher.amount, currency)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right sm:px-6">
                  <Badge variant={voucher.status === "Bokförd" ? "success" : "warning"}>
                    {voucher.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

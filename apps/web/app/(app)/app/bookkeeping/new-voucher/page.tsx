import { redirect } from "next/navigation";

/** Keeps the Phase 4 navigation bookmark working while using the canonical voucher route. */
export default function LegacyNewVoucherPage() {
  redirect("/app/bookkeeping/vouchers/new");
}

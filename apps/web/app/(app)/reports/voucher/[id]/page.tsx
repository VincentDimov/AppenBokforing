import { VoucherReport } from "@/components/reports/voucher-report";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VoucherReport id={id} />;
}

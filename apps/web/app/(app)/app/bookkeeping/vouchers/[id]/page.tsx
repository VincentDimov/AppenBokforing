import { VoucherEditor } from "@/components/journal-entries/voucher-editor";

interface VoucherDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function VoucherDetailPage({ params }: Readonly<VoucherDetailPageProps>) {
  const { id } = await params;

  return <VoucherEditor entryId={id} />;
}

import { VoucherEditor } from "@/components/journal-entries/voucher-editor";

interface PublicVoucherDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PublicVoucherDetailPage({
  params
}: Readonly<PublicVoucherDetailPageProps>) {
  const { id } = await params;

  return <VoucherEditor entryId={id} />;
}

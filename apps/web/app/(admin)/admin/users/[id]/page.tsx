import { AdminUserProfile } from "@/components/platform-admin/admin-profiles";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminUserProfile id={id} />;
}

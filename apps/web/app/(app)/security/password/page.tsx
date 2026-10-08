import { PasswordChangeForm } from "@/components/platform-admin/admin-security-setup";
import { PageHeader } from "@/components/ui/workspace";
export default function Page() {
  return (
    <section className="space-y-5">
      <PageHeader title="Säkra ditt konto" />
      <PasswordChangeForm />
    </section>
  );
}

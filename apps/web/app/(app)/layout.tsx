import type { ReactNode } from "react";

import { ApplicationShell } from "@/components/app/application-shell";
import { AuthProvider } from "@/components/auth/auth-provider";

export default function AuthenticatedLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AuthProvider>
      <ApplicationShell>{children}</ApplicationShell>
    </AuthProvider>
  );
}

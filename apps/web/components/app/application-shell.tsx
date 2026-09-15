"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

export function ApplicationShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    activeOrganization,
    activeOrganizationId,
    organizations,
    organizationsStatus,
    setActiveOrganizationId,
    signOut,
    status,
    user
  } = useAuth();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  useEffect(() => {
    if (status === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [pathname, router, status]);

  if (status === "loading") {
    return <LoadingScreen message="Återställer din säkra session…" />;
  }

  if (status === "error") {
    return (
      <LoadingScreen message="Kunde inte kontrollera din session. Ladda om sidan och försök igen." />
    );
  }

  if (status === "anonymous" || !user) {
    return <LoadingScreen message="Tar dig till inloggningen…" />;
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#eef4f6] text-[#17384b]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[17.5rem] border-r border-[#285268] bg-[#102f42] lg:block">
        <AppSidebar />
      </aside>

      {mobileNavigationOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Stäng navigering"
            className="absolute inset-0 bg-[#08202e]/55"
            onClick={() => setMobileNavigationOpen(false)}
            type="button"
          />
          <aside
            aria-label="Mobilnavigering"
            className="absolute inset-y-0 left-0 w-[18rem] max-w-[86vw] bg-[#102f42] shadow-[18px_0_42px_rgba(8,32,46,0.28)]"
          >
            <Button
              aria-label="Stäng navigering"
              className="absolute right-3 top-4 z-10 text-[#d8e8ee] hover:bg-[#285268] hover:text-white"
              onClick={() => setMobileNavigationOpen(false)}
              size="icon"
              type="button"
              variant="ghost"
            >
              ×
            </Button>
            <AppSidebar onNavigate={() => setMobileNavigationOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[17.5rem]">
        <AppTopbar
          activeOrganization={activeOrganization}
          activeOrganizationId={activeOrganizationId}
          onOpenNavigation={() => setMobileNavigationOpen(true)}
          onOrganizationChange={setActiveOrganizationId}
          onSignOut={handleSignOut}
          organizations={organizations}
          organizationsStatus={organizationsStatus}
          user={user}
        />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function LoadingScreen({ message }: Readonly<{ message: string }>) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#eef4f6] px-5 text-center text-[#527080]">
      <p>{message}</p>
    </main>
  );
}

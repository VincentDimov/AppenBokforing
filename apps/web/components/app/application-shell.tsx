"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { LoadingState } from "@/components/ui/workspace";
import { FiscalYearProvider } from "@/lib/use-fiscal-years";
import Link from "next/link";
import type { CSSProperties } from "react";

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
    user,
    refresh
  } = useAuth();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const signingOut = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("ledgerapp:sidebar:v1") === "collapsed");
    } catch {
      /* Optional UI state. */
    }
  }, []);
  function toggleSidebar() {
    setCollapsed((current) => {
      try {
        localStorage.setItem("ledgerapp:sidebar:v1", current ? "expanded" : "collapsed");
      } catch {
        /* Optional. */
      }
      return !current;
    });
  }
  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (status === "anonymous") {
      router.replace(signingOut.current ? "/" : `/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [pathname, router, status]);

  useEffect(() => {
    if (status === "authenticated" && organizationsStatus === "ready") {
      if (!organizations.length && pathname !== "/onboarding") router.replace("/onboarding");
      else if (organizations.length && pathname === "/onboarding") router.replace("/app");
    }
  }, [status, organizationsStatus, organizations.length, pathname, router]);

  if (status === "loading") {
    return <LoadingScreen message="Återställer din säkra session…" />;
  }

  if (status === "error") {
    return (
      <LoadingScreen
        message="Kunde inte kontrollera din session."
        action={
          <>
            <Button onClick={() => void refresh()}>Försök igen</Button>
            <Link href="/">Till startsidan</Link>
          </>
        }
      />
    );
  }

  if (status === "anonymous" || !user) {
    return <LoadingScreen message="Tar dig till inloggningen…" />;
  }
  if (pathname === "/onboarding")
    return <main className="workspace-content mx-auto max-w-2xl p-8">{children}</main>;
  if (organizationsStatus === "ready" && !organizations.length)
    return <LoadingScreen message="Förbereder din arbetsyta…" />;

  async function handleSignOut() {
    signingOut.current = true;
    await signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <FiscalYearProvider organizationId={activeOrganizationId}>
      <div
        className="min-h-screen bg-background text-ink"
        style={{ "--sidebar-width": collapsed ? "76px" : "248px" } as CSSProperties}
      >
        <a className="skip-link" href="#workspace-main">
          Hoppa till innehållet
        </a>
        <aside className="app-sidebar fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] bg-sidebar lg:block">
          <AppSidebar collapsed={collapsed} onToggle={toggleSidebar} />
        </aside>
        <Dialog
          open={mobileNavigationOpen}
          onClose={() => setMobileNavigationOpen(false)}
          title="Navigering"
          className="navigation-drawer"
        >
          <AppSidebar onNavigate={() => setMobileNavigationOpen(false)} />
        </Dialog>
        <div className="app-body min-w-0 lg:pl-[var(--sidebar-width)]">
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
          <main id="workspace-main" tabIndex={-1} className="workspace-content">
            {children}
          </main>
        </div>
      </div>
    </FiscalYearProvider>
  );
}

function LoadingScreen({ message, action }: Readonly<{ message: string; action?: ReactNode }>) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 text-center text-secondary">
      <section className="surface-panel max-w-lg">
        <LoadingState label={message} />
        {action && <div className="flex flex-wrap items-center justify-center gap-4">{action}</div>}
      </section>
    </main>
  );
}

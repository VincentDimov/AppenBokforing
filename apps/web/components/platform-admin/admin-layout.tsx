"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ShieldCheck,
  Users,
  Building2,
  Activity,
  KeyRound,
  Mail,
  ListChecks,
  Database,
  HardDrive,
  FileClock,
  Menu,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import { AuthProvider, useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Feedback, LoadingState } from "@/components/ui/workspace";
import { cn } from "@/lib/utils";

const modules = [
  { href: "/admin/users", label: "Användare", icon: Users },
  { href: "/admin/organizations", label: "Företag", icon: Building2 },
  { href: "/admin", label: "Adminöversikt", icon: LayoutDashboard },
  { href: "/admin/administrators", label: "Administratörer", icon: ShieldCheck },
  { href: "/admin/invitations", label: "Inbjudningar", icon: Mail },
  { href: "/admin/sessions", label: "Sessioner", icon: KeyRound },
  { href: "/admin/security", label: "Säkerhet", icon: Activity },
  { href: "/admin/audit", label: "Auditlogg", icon: ListChecks },
  { href: "/admin/system", label: "Systemstatus", icon: Database },
  { href: "/admin/usage", label: "Användning och lagring", icon: HardDrive },
  { href: "/admin/jobs", label: "Import och export", icon: FileClock },
  { href: "/admin/security-setup", label: "Administratörsprofil", icon: ShieldCheck }
];
export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AdminWorkspace>{children}</AdminWorkspace>
    </AuthProvider>
  );
}
function AdminWorkspace({ children }: { children: ReactNode }) {
  const { status, user, refresh, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const signingOut = useRef(false);
  const [mobile, setMobile] = useState(false),
    [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setMobile(false);
  }, [path]);
  useEffect(() => {
    if (status === "anonymous") router.replace(signingOut.current ? "/" : "/login");
    else if (
      status === "authenticated" &&
      user?.canAccessPlatformAdmin &&
      user.requiresAdminSecuritySetup &&
      path !== "/admin/security-setup"
    )
      router.replace("/admin/security-setup");
  }, [status, user, path, router]);
  if (status === "loading" || status === "anonymous")
    return (
      <main className="workspace-content">
        <LoadingState label="Verifierar administratörsåtkomst…" />
      </main>
    );
  if (status === "error")
    return (
      <main className="workspace-content">
        <Feedback kind="error" action={<Button onClick={() => void refresh()}>Försök igen</Button>}>
          Sessionen kunde inte verifieras.
        </Feedback>
      </main>
    );
  if (!user?.canAccessPlatformAdmin)
    return (
      <main className="workspace-content">
        <Feedback kind="error">
          Åtkomst nekad. Företagsrollen ADMIN ger inte plattformsbehörighet.
        </Feedback>
        <Link href="/app" className="mt-5 inline-block text-accent">
          Tillbaka till översikt
        </Link>
      </main>
    );
  if (user.requiresAdminSecuritySetup && path !== "/admin/security-setup")
    return (
      <main className="workspace-content">
        <LoadingState label="Administratörens säkerhetsinställningar krävs…" />
      </main>
    );
  const navigation = (small = false) => (
    <nav aria-label="Administrationsnavigering" className="flex h-full flex-col px-3 py-5">
      <p className="mb-6 flex items-center gap-2 px-3 font-semibold text-white">
        <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
        {(!collapsed || small) && "MASTER ADMIN"}
      </p>
      <Link
        href="/app"
        onClick={() => setMobile(false)}
        className="mb-5 flex items-center gap-3 rounded p-3 text-sm text-sidebar-text"
        aria-label="Tillbaka till översikt"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {(!collapsed || small) && "Tillbaka till översikt"}
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {modules.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMobile(false)}
            aria-label={collapsed && !small ? label : undefined}
            aria-current={
              path === href || (href !== "/admin" && path.startsWith(href + "/"))
                ? "page"
                : undefined
            }
            className={cn(
              "mb-1 flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-text hover:bg-white/10",
              (path === href || (href !== "/admin" && path.startsWith(href + "/"))) &&
                "bg-white/12 text-white"
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {(!collapsed || small) && label}
          </Link>
        ))}
      </div>
      {!small && (
        <Button
          variant="ghost"
          className="mt-4 text-white"
          aria-label={collapsed ? "Expandera navigering" : "Fäll ihop navigering"}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      )}
    </nav>
  );
  return (
    <div className="min-h-screen bg-background text-ink">
      <a href="#admin-main" className="skip-link">
        Hoppa till innehållet
      </a>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden bg-sidebar lg:block",
          collapsed ? "w-20" : "w-64"
        )}
      >
        {navigation()}
      </aside>
      <Dialog
        open={mobile}
        onClose={() => setMobile(false)}
        title="Administration"
        className="navigation-drawer"
      >
        {navigation(true)}
      </Dialog>
      <div className={cn("min-w-0", collapsed ? "lg:pl-20" : "lg:pl-64")}>
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b bg-surface px-4 sm:px-8">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Öppna administrationens navigering"
            className="lg:hidden"
            onClick={() => setMobile(true)}
          >
            <Menu className="size-5" />
          </Button>
          <span className="min-w-0 flex-1 truncate text-sm text-muted">
            Plattform / {modules.find((module) => module.href === path)?.label ?? "Profil"}
          </span>
          <span className="hidden text-sm sm:inline">{user.displayName}</span>
          <Button
            variant="outline"
            onClick={async () => {
              signingOut.current = true;
              await signOut();
              router.replace("/");
            }}
          >
            Logga ut
          </Button>
        </header>
        <main id="admin-main" tabIndex={-1} className="workspace-content">
          {children}
        </main>
      </div>
    </div>
  );
}

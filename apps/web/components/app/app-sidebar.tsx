"use client";

import {
  Archive,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  FileText,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  ListChecks,
  ReceiptText,
  Settings2,
  TableProperties,
  Upload,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  dashboardNavigationItem,
  navigationGroups,
  type NavigationIconName,
  type NavigationItem
} from "@/lib/app-navigation";
import { cn } from "@/lib/utils";

const navigationIcons: Record<NavigationIconName, LucideIcon> = {
  archive: Archive,
  "bar-chart-3": BarChart3,
  "book-open": BookOpen,
  "building-2": Building2,
  "calendar-days": CalendarDays,
  "file-text": FileText,
  "folder-kanban": FolderKanban,
  landmark: Landmark,
  "layout-dashboard": LayoutDashboard,
  "list-checks": ListChecks,
  "receipt-text": ReceiptText,
  "settings-2": Settings2,
  "table-properties": TableProperties,
  upload: Upload
};

interface AppSidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export function AppSidebar({ className, onNavigate }: Readonly<AppSidebarProps>) {
  const pathname = usePathname();

  return (
    <nav aria-label="Huvudnavigering" className={cn("flex h-full flex-col", className)}>
      <Link
        className="flex items-center gap-3 px-5 pb-7 pt-6 text-white outline-none focus-visible:ring-2 focus-visible:ring-[#9ad0e4]"
        href="/app"
        onClick={onNavigate}
      >
        <span className="grid size-9 place-items-center rounded-lg bg-[#74b7d1] text-[#0d2c3e] shadow-[0_8px_20px_rgba(0,0,0,0.16)]">
          <Landmark aria-hidden="true" className="size-5" strokeWidth={2.3} />
        </span>
        <span>
          <span className="block text-base font-semibold tracking-[-0.03em]">LedgerApp</span>
          <span className="mt-0.5 block text-[10px] font-medium tracking-[0.16em] text-[#a7c6d4] uppercase">
            Redovisning
          </span>
        </span>
      </Link>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5">
        <SidebarLink
          active={isActivePath(pathname, dashboardNavigationItem.href)}
          item={dashboardNavigationItem}
          onNavigate={onNavigate}
        />

        {navigationGroups.map((group) => (
          <section className="mt-6" key={group.label}>
            <p className="px-3 text-[10px] font-semibold tracking-[0.15em] text-[#91b2c2] uppercase">
              {group.label}
            </p>
            <div className="mt-2 space-y-0.5">
              {group.items.map((item) => (
                <SidebarLink
                  active={isActivePath(pathname, item.href)}
                  item={item}
                  key={item.href}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mx-3 mb-4 border-t border-[#2d566b] px-3 pt-4 text-xs leading-5 text-[#aac6d2]">
        <p className="font-medium text-[#d8e8ee]">Säker arbetsyta</p>
        <p className="mt-0.5">Åtkomst styrs av din organisationsroll.</p>
      </div>
    </nav>
  );
}

interface SidebarLinkProps {
  active: boolean;
  item: NavigationItem;
  onNavigate?: () => void;
}

function SidebarLink({ active, item, onNavigate }: Readonly<SidebarLinkProps>) {
  const Icon = navigationIcons[item.icon];

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#9ad0e4]",
        active
          ? "bg-[#29566d] text-white shadow-[inset_3px_0_0_#82c3da]"
          : "text-[#c7dce5] hover:bg-[#1d465b] hover:text-white"
      )}
      href={item.href}
      onClick={onNavigate}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-4 shrink-0", active ? "text-[#a9d7e7]" : "text-[#9cbecb]")}
        strokeWidth={2}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function isActivePath(pathname: string, href: string) {
  return href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

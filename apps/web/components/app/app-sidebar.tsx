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
  PanelLeftClose,
  PanelLeftOpen,
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
import { Button } from "@/components/ui/button";
import { isNavigationActive } from "@/lib/app-navigation";

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
  collapsed?: boolean;
  onToggle?: () => void;
}
export function AppSidebar({
  className,
  onNavigate,
  collapsed = false,
  onToggle
}: Readonly<AppSidebarProps>) {
  const pathname = usePathname();
  return (
    <nav aria-label="Huvudnavigering" className={cn("flex h-full flex-col", className)}>
      <Link
        className={cn(
          "flex items-center gap-3 px-5 py-5 text-white",
          collapsed && "justify-center px-0"
        )}
        href="/app"
        onClick={onNavigate}
        aria-label="LedgerApp – översikt"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-white/10 text-white">
          <Landmark aria-hidden="true" className="size-5" />
        </span>
        {!collapsed && (
          <span className="text-base font-semibold tracking-tight">
            LedgerApp
            <span className="block text-[11px] font-normal tracking-normal text-sidebar-muted">
              Bokföring & uppföljning
            </span>
          </span>
        )}
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <SidebarLink
          active={isNavigationActive(pathname, dashboardNavigationItem.href)}
          item={dashboardNavigationItem}
          onNavigate={onNavigate}
          collapsed={collapsed}
        />
        {navigationGroups.map((group) => (
          <section className="mt-5" key={group.label}>
            {!collapsed && (
              <p className="px-3 text-[11px] font-medium text-sidebar-muted">{group.label}</p>
            )}
            <div className="mt-2 space-y-0.5">
              {group.items.map((item) => (
                <SidebarLink
                  active={isNavigationActive(pathname, item.href)}
                  item={item}
                  key={item.href}
                  onNavigate={onNavigate}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="border-t border-white/10 px-3 py-3">
        {onToggle && (
          <Button
            type="button"
            variant="ghost"
            className="w-full text-sidebar-text hover:bg-white/10 hover:text-white"
            onClick={onToggle}
            aria-label={collapsed ? "Expandera navigering" : "Fäll ihop navigering"}
            title={collapsed ? "Expandera navigering" : "Fäll ihop navigering"}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="size-4" aria-hidden="true" />
                <span className="text-xs">Fäll ihop</span>
              </>
            )}
          </Button>
        )}
        {!collapsed && (
          <p className="px-3 pt-2 text-[11px] leading-5 text-sidebar-muted">
            Åtkomst styrs av din företagsroll.
          </p>
        )}
      </div>
    </nav>
  );
}
function SidebarLink({
  active,
  item,
  onNavigate,
  collapsed
}: {
  active: boolean;
  item: NavigationItem;
  onNavigate?: () => void;
  collapsed: boolean;
}) {
  const Icon = navigationIcons[item.icon];
  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex min-h-9 items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
        collapsed && "justify-center px-0",
        active ? "bg-white/12 text-white" : "text-sidebar-text hover:bg-white/6 hover:text-white"
      )}
      href={item.href}
      onClick={onNavigate}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-4 shrink-0", active ? "text-white" : "text-sidebar-muted")}
        strokeWidth={1.8}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

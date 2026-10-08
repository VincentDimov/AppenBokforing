"use client";

import { Building2, CalendarDays, ChevronDown, LogOut, Menu } from "lucide-react";

import type { AuthenticatedUser, OrganizationSummary } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { roleLabels } from "@/components/ui/workspace";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useFiscalYears } from "@/lib/use-fiscal-years";

interface AppTopbarProps {
  activeOrganization: OrganizationSummary | null;
  activeOrganizationId: string;
  onOpenNavigation: () => void;
  onOrganizationChange: (organizationId: string) => void;
  onSignOut: () => Promise<void>;
  organizations: OrganizationSummary[];
  organizationsStatus: "error" | "idle" | "loading" | "ready";
  user: AuthenticatedUser;
}

export function AppTopbar({
  activeOrganization,
  activeOrganizationId,
  onOpenNavigation,
  onOrganizationChange,
  onSignOut,
  organizations,
  organizationsStatus,
  user
}: Readonly<AppTopbarProps>) {
  const fiscalYears = useFiscalYears(activeOrganizationId);
  return (
    <header
      data-print-hidden
      className="app-topbar sticky top-0 z-30 border-b border-border bg-surface"
    >
      <div className="flex min-h-16 min-w-0 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button
          aria-label="Öppna navigering"
          className="lg:hidden shrink-0"
          onClick={onOpenNavigation}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Menu aria-hidden="true" className="size-5" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Building2 aria-hidden="true" className="hidden size-4 shrink-0 text-muted sm:block" />
          <Select
            onValueChange={onOrganizationChange}
            value={activeOrganizationId}
            disabled={organizationsStatus !== "ready" || !organizations.length}
          >
            <SelectTrigger
              aria-label="Aktiv organisation"
              className="w-full max-w-64 border-transparent bg-transparent px-2 hover:border-border"
            >
              <SelectValue
                placeholder={organizationsStatus === "loading" ? "Laddar företag…" : "Välj företag"}
              />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((organization) => (
                <SelectItem key={organization.id} value={organization.id}>
                  {organization.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeOrganization && (
            <Badge className="hidden shrink-0 xl:inline-flex" variant="outline">
              {roleLabels[activeOrganization.role]}
            </Badge>
          )}
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <CalendarDays aria-hidden="true" className="size-4 text-muted" />
          <Select value={fiscalYears.selected} onValueChange={fiscalYears.select}>
            <SelectTrigger aria-label="Aktivt räkenskapsår" className="w-36 lg:w-44">
              <SelectValue placeholder="Räkenskapsår" />
            </SelectTrigger>
            <SelectContent>
              {fiscalYears.years.map((year) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Öppna användarmeny" className="shrink-0 px-2" variant="ghost">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                {getInitials(user.displayName)}
              </span>
              <span className="hidden max-w-36 truncate lg:block">{user.displayName}</span>
              <ChevronDown aria-hidden="true" className="size-3.5 text-muted" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <p className="font-semibold">{user.displayName}</p>
              <p className="max-w-56 truncate text-xs font-normal text-muted">{user.email}</p>
              <p className="mt-1 text-xs text-secondary">
                {activeOrganization && roleLabels[activeOrganization.role]}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void onSignOut()}>
              <LogOut className="size-4" aria-hidden="true" />
              Logga ut
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-muted px-4 py-2 text-xs text-secondary md:hidden">
        <label className="flex min-w-0 items-center gap-2">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
          <select
            aria-label="Aktivt räkenskapsår"
            value={fiscalYears.selected}
            onChange={(event) => fiscalYears.select(event.target.value)}
            className="max-w-44 rounded border border-border bg-white px-2 py-1"
          >
            <option value="">Välj år</option>
            {fiscalYears.years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
        </label>
        <span>{activeOrganization && roleLabels[activeOrganization.role]}</span>
      </div>
      {fiscalYears.error && (
        <div role="alert" className="feedback feedback-error">
          <span>Räkenskapsåren kunde inte laddas. {fiscalYears.error}</span>
          <Button variant="outline" onClick={fiscalYears.retry}>
            Försök igen
          </Button>
        </div>
      )}
      {organizationsStatus === "error" && (
        <p role="alert" className="feedback feedback-error">
          Företagen kunde inte laddas. Din inloggning är fortfarande aktiv.
        </p>
      )}
    </header>
  );
}
function getInitials(displayName: string) {
  return (
    displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toLocaleUpperCase("sv-SE") || "U"
  );
}

"use client";

import { Building2, CalendarDays, ChevronDown, LogOut, Menu } from "lucide-react";

import type { AuthenticatedUser, OrganizationSummary } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
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
import { demoFiscalYears } from "@/lib/mock-data/dashboard";

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
  const currentFiscalYear = demoFiscalYears[0];

  return (
    <header className="sticky top-0 z-30 border-b border-[#d9e5ea] bg-[#f7fafb]/95 backdrop-blur">
      <div className="flex min-h-[4.25rem] items-center gap-3 px-4 sm:px-6 xl:px-8">
        <Button
          aria-label="Öppna navigering"
          className="lg:hidden"
          onClick={onOpenNavigation}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Menu aria-hidden="true" className="size-5" />
        </Button>

        <div className="hidden min-w-0 lg:block">
          <p className="text-xs font-semibold tracking-[0.12em] text-[#6a8492] uppercase">
            Arbetsyta
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[#17384b]">Bokföring och uppföljning</p>
        </div>

        <div className="ml-auto flex min-w-0 items-center justify-end gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-1.5 md:hidden">
            <Building2 aria-hidden="true" className="size-4 shrink-0 text-[#5f8192]" />
            <OrganizationSelector
              activeOrganizationId={activeOrganizationId}
              compact
              onOrganizationChange={onOrganizationChange}
              organizations={organizations}
              organizationsStatus={organizationsStatus}
            />
          </div>

          <div className="hidden min-w-0 items-center gap-2 md:flex">
            <Building2 aria-hidden="true" className="size-4 shrink-0 text-[#5f8192]" />
            <OrganizationSelector
              activeOrganizationId={activeOrganizationId}
              onOrganizationChange={onOrganizationChange}
              organizations={organizations}
              organizationsStatus={organizationsStatus}
            />
            {activeOrganization ? (
              <Badge className="hidden xl:inline-flex" variant="outline">
                {formatOrganizationRole(activeOrganization.role)}
              </Badge>
            ) : null}
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-[#5f8192]" />
            <Select defaultValue={currentFiscalYear?.id}>
              <SelectTrigger aria-label="Aktivt räkenskapsår" className="w-28 xl:w-48">
                <SelectValue placeholder="Räkenskapsår" />
              </SelectTrigger>
              <SelectContent>
                {demoFiscalYears.map((fiscalYear) => (
                  <SelectItem key={fiscalYear.id} value={fiscalYear.id}>
                    {fiscalYear.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge className="hidden 2xl:inline-flex" variant="warning">
              Exempeldata
            </Badge>
          </div>

          <div className="h-7 w-px bg-[#d9e5ea]" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label="Öppna användarmeny" className="max-w-56 px-2.5" variant="ghost">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#d7eaf1] text-xs font-bold text-[#1a516a]">
                  {getInitials(user.displayName)}
                </span>
                <span className="hidden truncate text-left sm:block">
                  <span className="block text-sm leading-4 text-[#17384b]">{user.displayName}</span>
                </span>
                <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-[#668291]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <p className="text-sm font-semibold text-[#17384b]">{user.displayName}</p>
                <p className="mt-0.5 max-w-48 truncate text-xs font-normal text-[#668291]">
                  {user.email}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void onSignOut()}>
                <LogOut aria-hidden="true" className="size-4 text-[#5f8192]" />
                Logga ut
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {organizationsStatus === "error" ? (
        <p className="border-t border-[#f2dfd6] bg-[#fff6f2] px-4 py-2 text-center text-xs text-[#9b513c] sm:px-6 xl:px-8">
          Organisationerna kunde inte laddas. Din inloggning är fortfarande aktiv.
        </p>
      ) : null}
    </header>
  );
}

interface OrganizationSelectorProps {
  activeOrganizationId: string;
  compact?: boolean;
  onOrganizationChange: (organizationId: string) => void;
  organizations: OrganizationSummary[];
  organizationsStatus: "error" | "idle" | "loading" | "ready";
}

function OrganizationSelector({
  activeOrganizationId,
  compact = false,
  onOrganizationChange,
  organizations,
  organizationsStatus
}: Readonly<OrganizationSelectorProps>) {
  const widthClassName = compact ? "w-28 min-[420px]:w-36" : "w-44 xl:w-56";

  if (organizationsStatus === "ready" && organizations.length > 0) {
    return (
      <Select onValueChange={onOrganizationChange} value={activeOrganizationId}>
        <SelectTrigger aria-label="Aktiv organisation" className={widthClassName}>
          <SelectValue placeholder="Välj organisation" />
        </SelectTrigger>
        <SelectContent>
          {organizations.map((organization) => (
            <SelectItem key={organization.id} value={organization.id}>
              {organization.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div
      className={`flex h-10 items-center rounded-lg border border-[#cbdbe3] bg-white px-3 text-sm text-[#668291] ${widthClassName}`}
    >
      {organizationsStatus === "loading" ? "Laddar…" : "Ingen organisation"}
    </div>
  );
}

function formatOrganizationRole(role: OrganizationSummary["role"]) {
  return role === "READ_ONLY" ? "LÄS" : role.replace("_", " ");
}

function getInitials(displayName: string) {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter((part): part is string => Boolean(part))
    .slice(0, 2)
    .join("");

  return initials.toLocaleUpperCase("sv-SE") || "U";
}

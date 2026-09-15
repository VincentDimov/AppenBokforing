export type NavigationIconName =
  | "archive"
  | "bar-chart-3"
  | "book-open"
  | "building-2"
  | "calendar-days"
  | "file-text"
  | "folder-kanban"
  | "landmark"
  | "layout-dashboard"
  | "list-checks"
  | "receipt-text"
  | "settings-2"
  | "table-properties"
  | "upload";

export interface NavigationItem {
  description: string;
  href: string;
  icon: NavigationIconName;
  label: string;
}

export interface NavigationGroup {
  items: NavigationItem[];
  label: string;
}

export const dashboardNavigationItem: NavigationItem = {
  description: "Översikt av resultat, moms och senaste verifikationer.",
  href: "/app",
  icon: "layout-dashboard",
  label: "Dashboard"
};

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Bokföring",
    items: [
      {
        description: "Granska verifikationer när bokföringsvyn är ansluten.",
        href: "/app/bookkeeping/vouchers",
        icon: "receipt-text",
        label: "Verifikationer"
      },
      {
        description: "Skapa och bokför en ny verifikation.",
        href: "/app/bookkeeping/vouchers/new",
        icon: "file-text",
        label: "Ny verifikation"
      },
      {
        description: "Hantera återkommande konteringsmallar.",
        href: "/app/bookkeeping/posting-templates",
        icon: "list-checks",
        label: "Konteringsmallar"
      },
      {
        description: "Samla underlag och bilagor per verifikation.",
        href: "/app/bookkeeping/attachments",
        icon: "archive",
        label: "Bilagor"
      }
    ]
  },
  {
    label: "Rapporter",
    items: [
      {
        description: "Följ kontoaktivitet i huvudboken.",
        href: "/app/reports/general-ledger",
        icon: "book-open",
        label: "Huvudbok"
      },
      {
        description: "Se en samlad lista över verifikationer.",
        href: "/app/reports/voucher-list",
        icon: "table-properties",
        label: "Verifikationslista"
      },
      {
        description: "Följ periodens intäkter och kostnader.",
        href: "/app/reports/income-statement",
        icon: "bar-chart-3",
        label: "Resultaträkning"
      },
      {
        description: "Visa tillgångar, skulder och eget kapital.",
        href: "/app/reports/balance-sheet",
        icon: "landmark",
        label: "Balansräkning"
      },
      {
        description: "Stäm av utgående och ingående moms.",
        href: "/app/reports/vat-report",
        icon: "receipt-text",
        label: "Momsrapport"
      }
    ]
  },
  {
    label: "Register",
    items: [
      {
        description: "Sök och administrera kontoplanen.",
        href: "/app/registers/accounts",
        icon: "list-checks",
        label: "Konton"
      },
      {
        description: "Följ upp arbetet per projekt.",
        href: "/app/registers/projects",
        icon: "folder-kanban",
        label: "Projekt"
      },
      {
        description: "Fördela kostnader på kostnadsställen.",
        href: "/app/registers/cost-centers",
        icon: "building-2",
        label: "Kostnadsställen"
      }
    ]
  },
  {
    label: "Inställningar",
    items: [
      {
        description: "Granska organisationens grunduppgifter.",
        href: "/app/settings/organization",
        icon: "building-2",
        label: "Organisation"
      },
      {
        description: "Hantera räkenskapsår och perioder.",
        href: "/app/settings/fiscal-years",
        icon: "calendar-days",
        label: "Räkenskapsår"
      },
      {
        description: "Hantera serie och numrering för verifikationer.",
        href: "/app/settings/voucher-series",
        icon: "settings-2",
        label: "Verifikationsserier"
      },
      {
        description: "Hantera användare och roller.",
        href: "/app/settings/users",
        icon: "building-2",
        label: "Användare"
      },
      {
        description: "Importera eller exportera bokföringsunderlag.",
        href: "/app/settings/import-export",
        icon: "upload",
        label: "Import / export"
      }
    ]
  }
];

export const allNavigationItems = [
  dashboardNavigationItem,
  ...navigationGroups.flatMap((group) => group.items)
];

export function getWorkspaceNavigationItem(slug: string[]): NavigationItem | undefined {
  const href = `/app/${slug.join("/")}`;

  return allNavigationItems.find((item) => item.href === href);
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/workspace";
import {
  useAdminData,
  adminDate,
  type AdminPage,
  type AdminUser,
  type AdminOrganization
} from "@/lib/platform-admin";
import { AdminResult, AdminTable, AdminPagination } from "./admin-shared";
import { AdminAction, adminInput, useAdminWrite, UserPicker } from "./admin-actions";

export function AdminDirectory({ kind }: { kind: "users" | "organizations" }) {
  const isUser = kind === "users",
    canWrite = useAdminWrite();
  const [search, setSearch] = useState(""),
    [filters, setFilters] = useState<Record<string, string>>({ sort: "name_asc" }),
    [query, setQuery] = useState("");
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(25);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    search: query,
    ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
  });
  const state = useAdminData<AdminPage<AdminUser | AdminOrganization>>(`/${kind}?${params}`);
  function filter(name: string, value: string) {
    setFilters((previous) => ({ ...previous, [name]: value }));
    setPage(1);
  }
  const field = (label: string, name: string, options: [string, string][]) => (
    <label className="text-sm">
      {label}
      <select
        className={adminInput}
        value={filters[name] ?? ""}
        onChange={(event) => filter(name, event.target.value)}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title={isUser ? "Användare" : "Företag"}
        context="Master Admin"
        description="Global administration av identiteter och företagsmetadata. Bokföring raderas aldrig här."
        action={
          canWrite ? (
            <AdminAction
              label={isUser ? "Skapa användare" : "Skapa företag"}
              path={`/${kind}`}
              consequence={
                isUser
                  ? "Kontot kräver lösenordsbyte vid första inloggningen. Ingen e-post skickas. Överlämna det tillfälliga lösenordet via en verifierad säker kanal."
                  : "Ett företag med vald ägare skapas. Administratören får inget automatiskt medlemskap och inget räkenskapsår skapas."
              }
              done={state.reload}
              payload={(form) =>
                isUser
                  ? {
                      email: form.get("email"),
                      displayName: form.get("displayName"),
                      password: form.get("password")
                    }
                  : {
                      name: form.get("name"),
                      ownerUserId: form.get("ownerUserId"),
                      countryCode: form.get("countryCode")
                    }
              }
            >
              {isUser ? (
                <>
                  <label className="block text-sm">
                    Namn
                    <input name="displayName" className={adminInput} required maxLength={160} />
                  </label>
                  <label className="block text-sm">
                    E-post
                    <input
                      type="email"
                      name="email"
                      className={adminInput}
                      required
                      maxLength={320}
                    />
                  </label>
                  <label className="block text-sm">
                    Tillfälligt lösenord
                    <input
                      type="password"
                      name="password"
                      className={adminInput}
                      required
                      minLength={14}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="block text-sm">
                    Företagsnamn
                    <input name="name" className={adminInput} required maxLength={160} />
                  </label>
                  <UserPicker name="ownerUserId" label="Ägarens användar-ID" />
                  <label className="block text-sm">
                    Land
                    <input
                      name="countryCode"
                      className={adminInput}
                      defaultValue="SE"
                      required
                      pattern="[A-Z]{2}"
                      maxLength={2}
                    />
                  </label>
                </>
              )}
            </AdminAction>
          ) : undefined
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">
          Sök {isUser ? "namn, e-post eller företag" : "företagsnamn, nummer, adress eller land"}
          <input
            className={adminInput}
            type="search"
            value={search}
            maxLength={160}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {field("Sortering", "sort", [
          ["name_asc", "Namn A–Ö"],
          ["name_desc", "Namn Ö–A"],
          ["newest", "Nyast först"],
          ["oldest", "Äldst först"],
          ...(isUser
            ? [
                ["last_login", "Senast inloggad"],
                ["company", "Företag A–Ö"]
              ]
            : [
                ["members_desc", "Flest medlemmar"],
                ["members_asc", "Minst medlemmar"],
                ["updated", "Senast uppdaterad"]
              ])
        ] as [string, string][])}
        {isUser ? (
          <>
            {field("Kontostatus", "status", [
              ["", "Alla"],
              ["ACTIVE", "Aktiv"],
              ["SUSPENDED", "Avstängd"],
              ["DEACTIVATED", "Inaktiverad"]
            ])}
            {field("Företagsmedlemskap", "hasCompany", [
              ["", "Alla"],
              ["yes", "Har företag"],
              ["no", "Utan företag"]
            ])}
            {field("Plattformsbehörighet", "platformAdmin", [
              ["", "Alla"],
              ["yes", "Plattformsadministratör"],
              ["no", "Vanlig användare"]
            ])}
            <label className="text-sm">
              Företags-ID
              <input
                className={adminInput}
                value={filters.organizationId ?? ""}
                onChange={(event) => filter("organizationId", event.target.value)}
                placeholder="UUID"
              />
            </label>
            {field("Roll i valt företag", "role", [
              ["", "Alla roller"],
              ["OWNER", "Ägare"],
              ["ADMIN", "Administratör"],
              ["ACCOUNTANT", "Redovisare"],
              ["MEMBER", "Medlem"],
              ["READ_ONLY", "Läsbehörighet"]
            ])}
          </>
        ) : (
          <>
            {field("Företagsstatus", "organizationStatus", [
              ["", "Alla"],
              ["active", "Aktivt"],
              ["inactive", "Inaktiverat"]
            ])}
            {field("Aktiva användare", "hasCompany", [
              ["", "Alla"],
              ["yes", "Har aktiva användare"],
              ["no", "Saknar aktiva användare"]
            ])}
            <label className="text-sm">
              Land (två bokstäver)
              <input
                className={adminInput}
                maxLength={2}
                value={filters.country ?? ""}
                onChange={(event) => filter("country", event.target.value.toUpperCase())}
              />
            </label>
            <label className="text-sm">
              Medlemmens användar-ID
              <input
                className={adminInput}
                value={filters.userId ?? ""}
                onChange={(event) => filter("userId", event.target.value)}
                placeholder="UUID"
              />
            </label>
            {field("Roll för vald medlem", "role", [
              ["", "Alla roller"],
              ["OWNER", "Ägare"],
              ["ADMIN", "Administratör"],
              ["ACCOUNTANT", "Redovisare"],
              ["MEMBER", "Medlem"],
              ["READ_ONLY", "Läsbehörighet"]
            ])}
          </>
        )}
        {["fromDate", "toDate", ...(isUser ? ["loginFrom", "loginTo"] : [])].map((name, index) => (
          <label key={name} className="text-sm">
            {["Registrerad från", "Registrerad till", "Inloggad från", "Inloggad till"][index]}
            <input
              className={adminInput}
              type="date"
              value={filters[name]?.slice(0, 10) ?? ""}
              onChange={(event) =>
                filter(
                  name,
                  event.target.value
                    ? event.target.value +
                        (name.endsWith("To") || name === "toDate"
                          ? "T23:59:59.999Z"
                          : "T00:00:00.000Z")
                    : ""
                )
              }
            />
          </label>
        ))}
      </div>
      <AdminResult {...state} retry={state.reload} empty={state.data?.total === 0}>
        <AdminTable
          label={isUser ? "Alla användare" : "Alla företag"}
          headers={
            isUser
              ? [
                  "Namn",
                  "E-post",
                  "Företag",
                  "Roll per företag",
                  "Status",
                  "Skapad",
                  "Senast inloggad",
                  "Åtgärd"
                ]
              : [
                  "Företag",
                  "Org.nr",
                  "Adress",
                  "Land",
                  "Användare",
                  "Status",
                  "Skapad",
                  "Uppdaterad",
                  "Åtgärd"
                ]
          }
        >
          {state.data?.items.map((row) =>
            isUser ? (
              <UserRow key={row.id} user={row as AdminUser} />
            ) : (
              <OrganizationRow key={row.id} org={row as AdminOrganization} />
            )
          )}
        </AdminTable>
      </AdminResult>
      {state.data && (
        <AdminPagination
          page={page}
          pageSize={pageSize}
          total={state.data.total}
          onPage={setPage}
          onPageSize={(value) => {
            setPageSize(value);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
function UserRow({ user }: { user: AdminUser }) {
  return (
    <tr className="border-b">
      <td className="p-4">
        <Link className="text-accent underline" href={`/admin/users/${user.id}`}>
          {user.displayName}
        </Link>
      </td>
      <td className="p-4">{user.email}</td>
      <td className="p-4">
        {user.organizationMemberships.map((member) => (
          <p key={member.id}>
            <Link className="underline" href={`/admin/organizations/${member.organizationId}`}>
              {member.organization.name}
            </Link>
          </p>
        ))}
        {user._count.organizationMemberships > 10 ? (
          <span>Visar 10 av {user._count.organizationMemberships}; alla i profilen.</span>
        ) : user._count.organizationMemberships === 0 ? (
          "Inget företag"
        ) : null}
      </td>
      <td className="p-4">
        {user.organizationMemberships.map((member) => (
          <p key={member.id}>
            {member.organization.name}: {member.role}
          </p>
        ))}
      </td>
      <td className="p-4">
        {user.accountStatus}
        {user.platformAdministrator?.isActive && !user.platformAdministrator.revokedAt && (
          <p className="text-xs">{user.platformAdministrator.role}</p>
        )}
      </td>
      <td className="p-4">{adminDate(user.createdAt)}</td>
      <td className="p-4">{adminDate(user.lastLoginAt)}</td>
      <td className="p-4">
        <details>
          <summary className="cursor-pointer">Åtgärder</summary>
          <Link className="mt-2 block underline" href={`/admin/users/${user.id}`}>
            Visa profil och hantera
          </Link>
        </details>
      </td>
    </tr>
  );
}
function OrganizationRow({ org }: { org: AdminOrganization }) {
  return (
    <tr className="border-b">
      <td className="p-4">
        <Link className="text-accent underline" href={`/admin/organizations/${org.id}`}>
          {org.name}
        </Link>
      </td>
      <td className="p-4">{org.organizationNumber ?? "—"}</td>
      <td className="p-4">{org.address ?? "—"}</td>
      <td className="p-4">{org.countryCode}</td>
      <td className="p-4">{org._count.members}</td>
      <td className="p-4">{org.isActive ? "Aktivt" : "Inaktiverat"}</td>
      <td className="p-4">{adminDate(org.createdAt)}</td>
      <td className="p-4">{adminDate(org.updatedAt)}</td>
      <td className="p-4">
        <details>
          <summary className="cursor-pointer">Åtgärder</summary>
          <Link className="mt-2 block underline" href={`/admin/organizations/${org.id}`}>
            Visa profil och hantera
          </Link>
        </details>
      </td>
    </tr>
  );
}

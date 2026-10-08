"use client";
import Link from "next/link";
import { useState } from "react";
import { PageHeader, Panel, Feedback } from "@/components/ui/workspace";
import {
  adminDate,
  useAdminData,
  type AdminUser,
  type AdminOrganization,
  type AdminMembership,
  type AdminPage,
  type AdminSession
} from "@/lib/platform-admin";
import { AdminResult, AdminPagination, AdminTable } from "./admin-shared";
import { AdminAction, adminInput, useAdminWrite, UserPicker } from "./admin-actions";
import { AdminAuditPage, AdminInvitations } from "./admin-monitoring";

const roles = ["ADMIN", "ACCOUNTANT", "MEMBER", "READ_ONLY"];
function RoleField({ value = "READ_ONLY" }: { value?: string }) {
  return (
    <label className="block text-sm">
      Företagsroll
      <select
        className={adminInput}
        name="role"
        defaultValue={roles.includes(value) ? value : "READ_ONLY"}
      >
        {roles.map((role) => (
          <option key={role}>{role}</option>
        ))}
      </select>
    </label>
  );
}
export function AdminUserProfile({ id }: { id: string }) {
  const state = useAdminData<AdminUser>(`/users/${id}`),
    write = useAdminWrite();
  const user = state.data;
  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="text-accent underline">
        Alla användare
      </Link>
      <AdminResult {...state} retry={state.reload}>
        {user && (
          <>
            <PageHeader
              title={user.displayName}
              context="Användarprofil"
              description={user.email}
            />
            <Panel className="p-5">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Användar-ID</dt>
                  <dd className="break-all font-mono">{id}</dd>
                </div>
                <div>
                  <dt className="text-muted">Status</dt>
                  <dd>{user.accountStatus}</dd>
                </div>
                <div>
                  <dt className="text-muted">Skapad / uppdaterad</dt>
                  <dd>
                    {adminDate(user.createdAt)} / {adminDate(user.updatedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Senast inloggad</dt>
                  <dd>{adminDate(user.lastLoginAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Plattformsroll</dt>
                  <dd>
                    {user.platformAdministrator?.isActive
                      ? user.platformAdministrator.role
                      : "Ingen"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Lösenordsbyte krävs</dt>
                  <dd>{user.mustChangePassword ? "Ja" : "Nej"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted">Intern administratörsanteckning</dt>
                  <dd className="whitespace-pre-wrap break-words">{user.adminNotes || "—"}</dd>
                </div>
              </dl>
            </Panel>
            <div className="flex flex-wrap gap-2">
              <AdminAction
                label="Redigera användare"
                method="PATCH"
                path={`/users/${id}`}
                disabled={!write}
                consequence="Namn och intern anteckning uppdateras. Byte av e-post är spärrat tills verifierad ägarskapskontroll finns."
                payload={(form) => ({
                  displayName: form.get("displayName"),
                  adminNotes: form.get("adminNotes")
                })}
                done={state.reload}
              >
                <label className="block text-sm">
                  Namn
                  <input
                    className={adminInput}
                    name="displayName"
                    defaultValue={user.displayName}
                    required
                    maxLength={160}
                  />
                </label>
                <label className="block text-sm">
                  Intern anteckning
                  <textarea
                    className={adminInput}
                    name="adminNotes"
                    defaultValue={user.adminNotes ?? ""}
                    maxLength={2000}
                  />
                </label>
              </AdminAction>
              <AdminAction
                label={user.isActive ? "Stäng av användare" : "Återaktivera användare"}
                path={`/users/${id}/${user.isActive ? "suspend" : "reactivate"}`}
                disabled={!write}
                target={user.email}
                consequence="Avstängning spärrar inloggning och återkallar alla sessioner. Sista aktiva superadministratören kan inte stängas av. Historik och bokföring bevaras."
                payload={() => ({})}
                done={state.reload}
              />
              <AdminAction
                label="Inaktivera användare"
                path={`/users/${id}/status`}
                disabled={!write || !user.isActive}
                target={user.email}
                consequence="Kontot inaktiveras och sessioner återkallas. Inga poster raderas."
                payload={() => ({ status: "DEACTIVATED" })}
                done={state.reload}
              />
              <AdminAction
                label="Återkalla alla sessioner"
                path={`/users/${id}/revoke-sessions`}
                disabled={!write}
                target={user.email}
                consequence="Användaren loggas ut på samtliga enheter."
                payload={() => ({})}
                done={state.reload}
              />
            </div>
            <Panel className="space-y-4 p-5">
              <h2 className="font-semibold">Lösenord och återställning</h2>
              <Feedback kind="info">
                E-postbaserad återställning och e-postbyte är inte konfigurerade. Inget
                återställningsmejl kan skickas. Administratörskonton återställs endast genom egna
                engångskoder och aktuell identitetskontroll.
              </Feedback>
              <div className="flex flex-wrap gap-2">
                <AdminAction
                  label="Kräv lösenordsbyte"
                  path={`/users/${id}/require-password-change`}
                  disabled={!write || Boolean(user.platformAdministrator)}
                  target={user.email}
                  consequence="Alla sessioner återkallas och nästa inloggning kräver nytt lösenord."
                  payload={() => ({})}
                  done={state.reload}
                />
                <AdminAction
                  label="Sätt tillfälligt lösenord"
                  path={`/users/${id}/temporary-password`}
                  disabled={!write || Boolean(user.platformAdministrator)}
                  target={user.email}
                  consequence="Alla sessioner återkallas. Lösenordsbyte krävs och ingen e-post skickas. Överlämna lösenordet via en verifierad säker kanal."
                  payload={(form) => ({ password: form.get("password") })}
                  done={state.reload}
                >
                  <label className="block text-sm">
                    Tillfälligt lösenord
                    <input
                      className={adminInput}
                      type="password"
                      name="password"
                      required
                      minLength={14}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                </AdminAction>
              </div>
            </Panel>
            <AdminMemberships user={user} />
            <AdminUserSessions user={user} />
            <AdminInvitations email={user.email} embedded />
            <AdminAuditPage userId={id} embedded />
          </>
        )}
      </AdminResult>
    </div>
  );
}
export function AdminMemberships({
  user,
  organizationId
}: {
  user?: AdminUser;
  organizationId?: string;
}) {
  const [page, setPage] = useState(1),
    [pageSize, setSize] = useState(25);
  const write = useAdminWrite();
  const base = user ? `/users/${user.id}/memberships` : `/organizations/${organizationId}/members`;
  const state = useAdminData<AdminPage<AdminMembership>>(
    `${base}?page=${page}&pageSize=${pageSize}`
  );
  return (
    <Panel className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Företagsmedlemskap</h2>
        {user && (
          <AdminAction
            label="Lägg till medlemskap"
            path={`/users/${user.id}/memberships`}
            target={user.email}
            disabled={!write || !user.isActive}
            consequence="En aktiv användare läggs till i ett aktivt företag. Ägarskap överförs i företagets separata ägarflöde."
            payload={(form) => ({
              organizationId: form.get("organizationId"),
              role: form.get("role")
            })}
            done={state.reload}
          >
            <label className="block text-sm">
              Företags-ID
              <input
                name="organizationId"
                className={adminInput}
                required
                pattern="[0-9a-fA-F-]{36}"
              />
              <Link
                href="/admin/organizations"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
              >
                Hämta från företagsprofilen i ny flik
              </Link>
            </label>
            <RoleField />
          </AdminAction>
        )}
        {!user && organizationId && (
          <AdminAction
            label="Lägg till användare i företaget"
            path={(form) => `/users/${encodeURIComponent(String(form.get("userId")))}/memberships`}
            disabled={!write}
            consequence="En aktiv befintlig användare läggs till. Bekräfta användarens exakta e-postadress. Global administration skapar inget eget medlemskap automatiskt."
            payload={(form) => ({
              organizationId,
              role: form.get("role"),
              confirmation: form.get("confirmation")
            })}
            done={state.reload}
          >
            <UserPicker />
            <label className="block text-sm">
              Bekräfta användarens e-postadress
              <input
                className={adminInput}
                name="confirmation"
                type="email"
                required
                autoComplete="off"
              />
            </label>
            <RoleField />
          </AdminAction>
        )}
      </div>
      <AdminResult {...state} retry={state.reload} empty={state.data?.total === 0}>
        <AdminTable
          label="Företagsmedlemskap"
          headers={["Användare", "Företag", "Roll", "Status", "Åtgärder"]}
        >
          {state.data?.items.map((member) => (
            <tr key={member.id} className="border-b">
              <td className="p-3">
                <Link className="underline" href={`/admin/users/${member.userId}`}>
                  {member.user.displayName}
                </Link>
              </td>
              <td className="p-3">
                <Link className="underline" href={`/admin/organizations/${member.organizationId}`}>
                  {member.organization.name}
                </Link>
              </td>
              <td className="p-3">{member.role}</td>
              <td className="p-3">{member.removedAt ? "Borttaget" : "Aktivt"}</td>
              <td className="flex flex-wrap gap-2 p-3">
                <AdminAction
                  label="Ändra roll"
                  method="PATCH"
                  path={`/users/${member.userId}/memberships/${member.id}`}
                  target={member.user.email}
                  disabled={!write || Boolean(member.removedAt)}
                  consequence="Företagsrollen ändras och loggas. Sista ägaren kan inte tas bort."
                  payload={(form) => ({ role: form.get("role") })}
                  done={state.reload}
                >
                  <RoleField value={member.role} />
                </AdminAction>
                <AdminAction
                  label={member.removedAt ? "Återställ medlemskap" : "Ta bort medlemskap"}
                  method="PATCH"
                  path={`/users/${member.userId}/memberships/${member.id}`}
                  target={member.user.email}
                  disabled={!write || (Boolean(member.removedAt) && member.role === "OWNER")}
                  consequence="Medlemskapet ändras utan att historiska bokföringsposter raderas. Borttaget ägarskap kräver explicit ägaröverföring."
                  payload={() => ({ removed: !member.removedAt })}
                  done={state.reload}
                />
              </td>
            </tr>
          ))}
        </AdminTable>
      </AdminResult>
      {state.data && (
        <AdminPagination
          page={page}
          pageSize={pageSize}
          total={state.data.total}
          onPage={setPage}
          onPageSize={(value) => {
            setSize(value);
            setPage(1);
          }}
        />
      )}
    </Panel>
  );
}
function AdminUserSessions({ user }: { user: AdminUser }) {
  const [page, setPage] = useState(1),
    [pageSize, setSize] = useState(25);
  const write = useAdminWrite();
  const state = useAdminData<AdminPage<AdminSession>>(
    `/sessions?userId=${user.id}&page=${page}&pageSize=${pageSize}`
  );
  return (
    <Panel className="space-y-4 p-5">
      <h2 className="font-semibold">Sessioner</h2>
      <AdminResult {...state} retry={state.reload} empty={state.data?.total === 0}>
        <AdminTable
          label="Användarsessioner"
          headers={["Skapad", "Senast använd", "Utgår", "Status", "Enhet / maskerad IP", "Åtgärd"]}
        >
          {state.data?.items.map((session) => (
            <tr key={session.id} className="border-b">
              <td className="p-3">{adminDate(session.createdAt)}</td>
              <td className="p-3">{adminDate(session.lastSeenAt)}</td>
              <td className="p-3">{adminDate(session.expiresAt)}</td>
              <td className="p-3">
                {session.revokedAt
                  ? `Återkallad: ${session.revocationReason}`
                  : new Date(session.expiresAt) <= new Date()
                    ? "Utgången"
                    : "Aktiv"}
              </td>
              <td className="max-w-xs break-words p-3">
                {session.userAgent ?? "Okänd enhet"}
                <p>{session.ipAddress ?? "—"}</p>
              </td>
              <td className="p-3">
                <AdminAction
                  label="Återkalla session"
                  path={`/users/${user.id}/sessions/${session.id}/revoke`}
                  target={user.email}
                  disabled={!write || Boolean(session.revokedAt)}
                  consequence="Den valda sessionen återkallas om den tillhör användaren."
                  payload={() => ({})}
                  done={state.reload}
                />
              </td>
            </tr>
          ))}
        </AdminTable>
      </AdminResult>
      {state.data && (
        <AdminPagination
          page={page}
          pageSize={pageSize}
          total={state.data.total}
          onPage={setPage}
          onPageSize={(value) => {
            setSize(value);
            setPage(1);
          }}
        />
      )}
    </Panel>
  );
}
export function AdminOrganizationProfile({ id }: { id: string }) {
  const state = useAdminData<AdminOrganization>(`/organizations/${id}`),
    write = useAdminWrite();
  const org = state.data;
  return (
    <div className="space-y-6">
      <Link href="/admin/organizations" className="text-accent underline">
        Alla företag
      </Link>
      <AdminResult {...state} retry={state.reload}>
        {org && (
          <>
            <PageHeader
              title={org.name}
              context="Företagsprofil"
              description="Endast metadata. Global administration ger inte rätt att läsa bokföringsinnehåll."
            />
            <Panel className="p-5">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Företags-ID</dt>
                  <dd className="break-all font-mono">{id}</dd>
                </div>
                <div>
                  <dt className="text-muted">Status</dt>
                  <dd>{org.isActive ? "Aktivt" : "Inaktiverat"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Organisationsnummer / land</dt>
                  <dd>
                    {org.organizationNumber ?? "—"} / {org.countryCode}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Adress</dt>
                  <dd>{org.address ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Skapad / uppdaterad</dt>
                  <dd>
                    {adminDate(org.createdAt)} / {adminDate(org.updatedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Registrerad användning</dt>
                  <dd>
                    {org._count.members} medlemskap · {org._count.journalEntries} verifikationer ·{" "}
                    {org._count.attachments} bilagor · {org._count.sieImports} importer
                  </dd>
                </div>
              </dl>
            </Panel>
            <div className="flex flex-wrap gap-2">
              <AdminAction
                label="Redigera företag"
                method="PATCH"
                path={`/organizations/${id}`}
                disabled={!write}
                consequence="Företagets metadata ändras. Organisationsnummer och land låses när bokföring eller ingående balanser finns."
                payload={(form) => ({
                  name: form.get("name"),
                  address: form.get("address"),
                  countryCode: form.get("countryCode"),
                  ...(form.get("organizationNumber")
                    ? { organizationNumber: form.get("organizationNumber") }
                    : {})
                })}
                done={state.reload}
              >
                <label className="block text-sm">
                  Namn
                  <input
                    name="name"
                    className={adminInput}
                    defaultValue={org.name}
                    required
                    maxLength={160}
                  />
                </label>
                <label className="block text-sm">
                  Adress
                  <input
                    name="address"
                    className={adminInput}
                    defaultValue={org.address ?? ""}
                    maxLength={500}
                  />
                </label>
                <label className="block text-sm">
                  Organisationsnummer
                  <input
                    name="organizationNumber"
                    className={adminInput}
                    defaultValue={org.organizationNumber ?? ""}
                    pattern="[0-9]{6}-?[0-9]{4}"
                  />
                </label>
                <label className="block text-sm">
                  Land
                  <input
                    name="countryCode"
                    className={adminInput}
                    defaultValue={org.countryCode}
                    required
                    pattern="[A-Z]{2}"
                  />
                </label>
              </AdminAction>
              <AdminAction
                label={org.isActive ? "Inaktivera företag" : "Återaktivera företag"}
                path={`/organizations/${id}/${org.isActive ? "deactivate" : "reactivate"}`}
                disabled={!write}
                target={org.name}
                consequence="Företagsåtkomst spärras vid inaktivering. Bokföring, bilagor och historik bevaras. Ingen organisation raderas."
                payload={() => ({})}
                done={state.reload}
              />
              <AdminAction
                label="Överför ägarskap"
                path={`/organizations/${id}/transfer-owner`}
                target={org.name}
                disabled={!write || !org.isActive}
                consequence="Ny ägare måste vara aktiv befintlig medlem. Tidigare ägare får ADMIN. Överföringen sker atomiskt och loggas."
                payload={(form) => ({
                  fromUserId: form.get("fromUserId"),
                  toUserId: form.get("toUserId")
                })}
                done={state.reload}
              >
                <UserPicker name="fromUserId" label="Nuvarande ägarens användar-ID" />
                <UserPicker name="toUserId" label="Ny ägares användar-ID" />
              </AdminAction>
            </div>
            <AdminMemberships organizationId={id} />
            <AdminInvitations organizationId={id} embedded />
            <Panel className="space-y-3 p-5">
              <h2 className="font-semibold">Räkenskapsår och låsstatus</h2>
              <p className="text-sm text-muted">
                Senaste 25 av {org._count.fiscalYears} räkenskapsår; ingen administrativ upplåsning
                eller bokföringsredigering erbjuds.
              </p>
              <p className="text-sm text-muted">
                Räkenskapsår hanteras i den vanliga arbetsytan efter att företaget valts.
                Företagsmedlemskap och rätt behörighet krävs även för globala administratörer.{" "}
                <Link className="underline" href="/settings/fiscal-years">
                  Öppna ordinarie räkenskapsårsflöde
                </Link>
              </p>
              {org.fiscalYears?.map((year) => (
                <p className="text-sm" key={year.id}>
                  {year.name} · {year.startDate.slice(0, 10)} – {year.endDate.slice(0, 10)} ·{" "}
                  {year.status} · {year._count.accountingPeriods} låsta perioder
                </p>
              ))}
              <h2 className="pt-3 font-semibold">Verifikationsserier</h2>
              <p className="text-sm text-muted">Visar högst 100 serier.</p>
              {org.voucherSeries?.map((series) => (
                <p className="text-sm" key={series.id}>
                  {series.code} · {series.name} · {series.isActive ? "Aktiv" : "Inaktiv"}
                </p>
              ))}
              <h2 className="pt-3 font-semibold">Verifikationsstatus (antal, inte belopp)</h2>
              {org.voucherCounts?.map((count) => (
                <p key={count.status}>
                  {count.status}: {count.count}
                </p>
              ))}
            </Panel>
            <AdminAuditPage organizationId={id} embedded />
          </>
        )}
      </AdminResult>
    </div>
  );
}

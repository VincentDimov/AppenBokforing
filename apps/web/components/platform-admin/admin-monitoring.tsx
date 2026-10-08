"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeader, Panel, Feedback } from "@/components/ui/workspace";
import { Button } from "@/components/ui/button";
import {
  useAdminData,
  adminDate,
  type AdminPage,
  type AdminAudit,
  type AdminGrant,
  type AdminInvitation,
  type AdminSession,
  type AdminSystem
} from "@/lib/platform-admin";
import { AdminResult, AdminTable, AdminPagination } from "./admin-shared";
import { AdminAction, adminInput, useAdminWrite, UserPicker } from "./admin-actions";

export function AdminAuditPage({
  userId,
  organizationId,
  embedded = false
}: {
  userId?: string;
  organizationId?: string;
  embedded?: boolean;
}) {
  const [filters, setFilters] = useState<Record<string, string>>({}),
    [page, setPage] = useState(1),
    [pageSize, setSize] = useState(25);
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(userId ? { userId } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...filters
  });
  const state = useAdminData<AdminPage<AdminAudit>>(`/audit?${params}`);
  function download() {
    if (!state.data) return;
    const cell = (value: string) =>
      '"' + (/^[=+\-@\t\r\n]/.test(value) ? "'" : "") + value.replaceAll('"', '""') + '"';
    const csv =
      "\uFEFF" +
      [
        ["Tid", "Aktör", "Åtgärd", "Måltyp", "Mål-ID", "Resultat", "Request-ID"],
        ...state.data.items.map((event) => [
          event.timestamp,
          event.actor?.displayName ?? "Operatör/system",
          event.action,
          event.targetType,
          event.targetId ?? "",
          event.result,
          event.requestId ?? ""
        ])
      ]
        .map((row) => row.map(cell).join(";"))
        .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "admin-audit-visad-sida.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="space-y-4">
      {embedded ? (
        <h2 className="font-semibold">Adminhistorik för profilen</h2>
      ) : (
        <PageHeader
          title="Auditlogg"
          context="Master Admin"
          description="Append-only global historik. Lösenord, tokens och MFA-hemligheter ingår aldrig i loggen."
        />
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setFilters(
            Object.fromEntries(
              [...form.entries()]
                .filter(([, value]) => value)
                .map(([key, value]) => [
                  key,
                  key === "fromDate"
                    ? value + "T00:00:00.000Z"
                    : key === "toDate"
                      ? value + "T23:59:59.999Z"
                      : String(value)
                ])
            )
          );
          setPage(1);
        }}
      >
        {["action", "actorUserId", "userId", "targetType", "organizationId", "fromDate", "toDate"]
          .filter(
            (name) =>
              !(organizationId && name === "organizationId") && !(userId && name === "userId")
          )
          .map((name) => (
            <label className="text-sm" key={name}>
              {
                (
                  {
                    action: "Åtgärd",
                    actorUserId: "Aktörens användar-ID",
                    userId: "Berörd användares ID",
                    targetType: "Måltyp",
                    organizationId: "Företags-ID",
                    fromDate: "Från datum",
                    toDate: "Till datum"
                  } as Record<string, string>
                )[name]
              }
              <input
                name={name}
                type={name.endsWith("Date") ? "date" : "text"}
                className={adminInput}
                maxLength={100}
              />
            </label>
          ))}
        <label className="text-sm">
          Resultat
          <select name="result" className={adminInput}>
            <option value="">Alla</option>
            <option>SUCCESS</option>
            <option>DENIED</option>
            <option>FAILURE</option>
          </select>
        </label>
        <Button variant="outline">Filtrera</Button>
        <Button
          type="button"
          variant="outline"
          disabled={!state.data?.items.length}
          onClick={download}
        >
          Exportera visad sida (CSV)
        </Button>
      </form>
      <AdminResult {...state} retry={state.reload} empty={state.data?.total === 0}>
        <AdminTable
          label="Global adminhistorik"
          headers={["Tid", "Aktör", "Åtgärd", "Mål", "Resultat", "Request-ID", "Metadata"]}
        >
          {state.data?.items.map((event) => (
            <tr key={event.id} className="border-b">
              <td className="p-3">{adminDate(event.timestamp)}</td>
              <td className="p-3">{event.actor?.displayName ?? "Operatör/system"}</td>
              <td className="p-3">{event.action}</td>
              <td className="max-w-xs break-all p-3">
                {event.targetType}
                <p>{event.targetId ?? "—"}</p>
              </td>
              <td className="p-3">{event.result}</td>
              <td className="max-w-xs break-all p-3">{event.requestId ?? "—"}</td>
              <td className="p-3">
                <details>
                  <summary className="cursor-pointer">Visa före / efter</summary>
                  <pre className="max-w-xs overflow-x-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(
                      { före: event.beforeMetadata, efter: event.afterMetadata },
                      null,
                      2
                    )}
                  </pre>
                </details>
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
    </section>
  );
}
export function AdminAdministrators() {
  const { user } = useAuth();
  const superAdmin = user?.platformRole === "SUPER_ADMIN";
  const [page, setPage] = useState(1),
    [pageSize, setSize] = useState(25);
  const state = useAdminData<AdminPage<AdminGrant>>(
    `/administrators?page=${page}&pageSize=${pageSize}`
  );
  const roleField = (role = "PLATFORM_VIEWER") => (
    <label className="block text-sm">
      Plattformsroll
      <select name="role" className={adminInput} defaultValue={role}>
        {["SUPER_ADMIN", "PLATFORM_ADMIN", "SUPPORT_ADMIN", "PLATFORM_VIEWER"].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Plattformsadministratörer"
        context="Master Admin"
        description="Separata globala roller. Alla kräver eget lösenordsbyte, MFA och aktuella sessioner."
      />
      <Feedback kind="info">
        Endast SUPER_ADMIN kan ändra globala behörigheter. Sista aktiva SUPER_ADMIN kan inte
        avaktiveras. Ingen plattformsroll ger automatiskt företagsmedlemskap.
      </Feedback>
      {superAdmin && (
        <AdminAction
          label="Tilldela plattformsroll"
          path="/administrators"
          consequence="Användaren får separat global behörighet. Alla sessioner återkallas och första säkerhetsinställning krävs. Bekräfta den valda användarens e-post nedan."
          payload={(form) => ({
            userId: form.get("userId"),
            role: form.get("role"),
            isActive: true,
            confirmation: form.get("confirmation")
          })}
          done={state.reload}
        >
          <UserPicker />
          {roleField()}
          <label className="block text-sm">
            Bekräfta användarens e-post
            <input name="confirmation" type="email" className={adminInput} required />
          </label>
        </AdminAction>
      )}
      <AdminResult {...state} retry={state.reload} empty={state.data?.total === 0}>
        <AdminTable
          label="Plattformsadministratörer"
          headers={[
            "Namn",
            "E-post",
            "Plattformsroll",
            "Status",
            "MFA",
            "Senast inloggad",
            "Tilldelad / av",
            "Åtgärd"
          ]}
        >
          {state.data?.items.map((grant) => (
            <tr key={grant.id} className="border-b">
              <td className="p-3">
                <Link className="underline" href={`/admin/users/${grant.userId}`}>
                  {grant.user.displayName}
                </Link>
              </td>
              <td className="p-3">{grant.user.email}</td>
              <td className="p-3">{grant.role}</td>
              <td className="p-3">
                {grant.isActive && !grant.revokedAt && grant.user.isActive ? "Aktiv" : "Inaktiv"}
              </td>
              <td className="p-3">
                {grant.user.platformMfaCredential?.verifiedAt
                  ? "Registrerad"
                  : "Säkerhetsinställning krävs"}
              </td>
              <td className="p-3">{adminDate(grant.user.lastLoginAt)}</td>
              <td className="p-3">
                {adminDate(grant.grantedAt)} · {grant.grantedBy?.displayName ?? "Bootstrapoperatör"}
              </td>
              <td className="space-y-2 p-3">
                <AdminAction
                  label="Ändra plattformsroll"
                  path="/administrators"
                  target={grant.user.email}
                  disabled={!superAdmin}
                  consequence="Rollen ändras och alla sessioner återkallas. Databasen skyddar sista aktiva SUPER_ADMIN."
                  payload={(form) => ({
                    userId: grant.userId,
                    role: form.get("role"),
                    isActive: grant.isActive
                  })}
                  done={state.reload}
                >
                  {roleField(grant.role)}
                </AdminAction>
                <AdminAction
                  label={
                    grant.isActive ? "Återkalla plattformsroll" : "Återaktivera plattformsroll"
                  }
                  path="/administrators"
                  target={grant.user.email}
                  disabled={!superAdmin}
                  consequence="Global behörighet ändras och samtliga sessioner återkallas. Bokföring och företagsroller bevaras."
                  payload={() => ({
                    userId: grant.userId,
                    role: grant.role,
                    isActive: !grant.isActive
                  })}
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
    </div>
  );
}
export function AdminInvitations({
  organizationId,
  email,
  embedded = false
}: {
  organizationId?: string;
  email?: string;
  embedded?: boolean;
}) {
  const write = useAdminWrite();
  const [page, setPage] = useState(1),
    [pageSize, setSize] = useState(25),
    [filter, setFilter] = useState("");
  const state = useAdminData<AdminPage<AdminInvitation>>(
    `/invitations?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(email ?? filter)}${organizationId ? `&organizationId=${encodeURIComponent(organizationId)}` : ""}`
  );
  return (
    <div className="space-y-6">
      {embedded ? (
        <h2 className="font-semibold">Inbjudningshistorik</h2>
      ) : (
        <PageHeader
          title="Inbjudningar"
          context="Master Admin"
          description="Persistenta företagsinbjudningar utan tokenexponering."
        />
      )}
      <Feedback kind="info">
        Verifierad e-postleverans är inte konfigurerad. Återsändning är därför otillgänglig; inget
        meddelande skickas.
      </Feedback>
      {!email && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setFilter(String(new FormData(event.currentTarget).get("search")));
            setPage(1);
          }}
          className="flex items-end gap-3"
        >
          <label className="text-sm">
            Sök e-post
            <input className={adminInput} name="search" maxLength={160} />
          </label>
          <Button variant="outline">Sök</Button>
        </form>
      )}
      <AdminResult {...state} retry={state.reload} empty={state.data?.total === 0}>
        <AdminTable
          label="Inbjudningar"
          headers={[
            "E-post",
            "Företag",
            "Roll",
            "Inbjuden av",
            "Skapad / utgår",
            "Status",
            "Åtgärd"
          ]}
        >
          {state.data?.items.map((invite) => (
            <tr key={invite.id} className="border-b">
              <td className="p-3">{invite.email}</td>
              <td className="p-3">
                <Link className="underline" href={`/admin/organizations/${invite.organization.id}`}>
                  {invite.organization.name}
                </Link>
              </td>
              <td className="p-3">{invite.role}</td>
              <td className="p-3">{invite.invitedBy.displayName}</td>
              <td className="p-3">
                {adminDate(invite.createdAt)} / {adminDate(invite.expiresAt)}
              </td>
              <td className="p-3">
                {invite.acceptedAt
                  ? "Accepterad"
                  : invite.revokedAt
                    ? "Återkallad"
                    : new Date(invite.expiresAt) <= new Date()
                      ? "Utgången"
                      : "Väntande"}
              </td>
              <td className="p-3">
                <AdminAction
                  label="Återkalla inbjudan"
                  path={`/invitations/${invite.id}/revoke`}
                  target={invite.email}
                  disabled={!write || Boolean(invite.acceptedAt || invite.revokedAt)}
                  consequence="Inbjudan återkallas. Befintliga medlemskap påverkas inte."
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
    </div>
  );
}
export function AdminSessions() {
  const [page, setPage] = useState(1),
    [pageSize, setSize] = useState(25),
    [filter, setFilter] = useState("");
  const state = useAdminData<AdminPage<AdminSession>>(
    `/sessions?page=${page}&pageSize=${pageSize}${filter ? `&userId=${filter}` : ""}`
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sessioner"
        context="Master Admin"
        description="Sessionernas metadata. Refresh-token och tokenhashar visas aldrig."
      />
      <form
        className="flex items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter(String(new FormData(event.currentTarget).get("userId")));
          setPage(1);
        }}
      >
        <label className="text-sm">
          Användar-ID
          <input name="userId" className={adminInput} placeholder="UUID, eller tomt för alla" />
        </label>
        <Button variant="outline">Filtrera</Button>
      </form>
      <AdminResult {...state} retry={state.reload} empty={state.data?.total === 0}>
        <AdminTable
          label="Globala sessioner"
          headers={[
            "Användare",
            "Skapad",
            "Senast använd",
            "Utgår",
            "Status",
            "Maskerad IP",
            "Hantera"
          ]}
        >
          {state.data?.items.map((session) => (
            <tr key={session.id} className="border-b">
              <td className="p-3">{session.user?.displayName}</td>
              <td className="p-3">{adminDate(session.createdAt)}</td>
              <td className="p-3">{adminDate(session.lastSeenAt)}</td>
              <td className="p-3">{adminDate(session.expiresAt)}</td>
              <td className="p-3">
                {session.revokedAt
                  ? "Återkallad"
                  : new Date(session.expiresAt) <= new Date()
                    ? "Utgången"
                    : "Aktiv"}
              </td>
              <td className="p-3">{session.ipAddress ?? "—"}</td>
              <td className="p-3">
                <Link className="underline" href={`/admin/users/${session.userId}`}>
                  Hantera i användarprofil
                </Link>
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
    </div>
  );
}
interface AdminSecurity {
  activeAdministrators: number;
  recentChanges: AdminAudit[];
  mfaEncryptionConfigured: boolean;
  notificationDeliveryConfigured: boolean;
  suspendedUsers: number;
  inactiveGrants: number;
  pendingMfa: number;
  revokedSessions: number;
  deniedLast24h: number;
  recent: AdminAudit[];
}
interface AdminUsage {
  users: number;
  organizations: number;
  vouchers: number;
  attachments: number;
  attachmentBytes: string;
  imports: number;
  exports: number;
}
export function AdminStatusPage({ kind }: { kind: "system" | "usage" | "security" }) {
  const state = useAdminData<AdminSystem | AdminUsage | AdminSecurity>(`/${kind}`);
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          kind === "system"
            ? "Systemstatus"
            : kind === "usage"
              ? "Användning och lagring"
              : "Säkerhetscenter"
        }
        context="Master Admin"
      />
      <AdminResult {...state} retry={state.reload}>
        {state.data && <StatusContent kind={kind} data={state.data} />}
      </AdminResult>
    </div>
  );
}
function StatusContent({
  kind,
  data
}: {
  kind: string;
  data: AdminSystem | AdminUsage | AdminSecurity;
}) {
  if (kind === "system") {
    const state = data as AdminSystem;
    return (
      <>
        <Panel className="space-y-3 p-5">
          <h2 className="font-semibold">API och databas</h2>
          <p>API: {state.apiAvailable ? "Tillgängligt" : "Otillgängligt"}</p>
          <p>Databaskontroll: {state.databaseReady ? "Godkänd" : "Misslyckad"}</p>
          <p>
            Databasversion:{" "}
            {state.migrationCompatible
              ? "Kompatibel med FAS 36"
              : "Ej verifierad kompatibel – kontrollera migrationerna"}
          </p>
          <p>Applikationsversion: {state.applicationVersion}</p>
          <p>
            Migrationer: {state.migrationState?.applied ?? "Okänt"} tillämpade ·{" "}
            {state.migrationState?.failed ?? "Okänt"} misslyckade
          </p>
          <p>
            MFA-kryptering:{" "}
            {state.mfaEncryptionConfigured ? "Konfigurerad" : "Saknas – adminåtkomst spärras"}
          </p>
        </Panel>
        <Feedback kind="info">
          Objektlagring, externa driftmått, CPU, minne och upptid har inte verifierats av denna
          endpoint. Använd driftmiljöns auktoriserade readiness-kontroll. E-postleverans är inte
          konfigurerad.
        </Feedback>
      </>
    );
  }
  if (kind === "usage") {
    const state = data as AdminUsage;
    const labels: Record<string, string> = {
      users: "Användare",
      organizations: "Företag",
      vouchers: "Verifikationer",
      attachments: "Bilagor",
      attachmentBytes: "Bilagornas registrerade byte",
      imports: "SIE-importer",
      exports: "SIE-exporter"
    };
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Object.keys(labels).map((key) => (
            <Panel key={key} className="p-5">
              <h2 className="text-sm text-muted">{labels[key]}</h2>
              <p className="mt-3 text-2xl font-semibold">
                {String(state[key as keyof AdminUsage])}
              </p>
            </Panel>
          ))}
        </div>
        <Feedback kind="info">
          Lagringsstorlek beräknas från bilagornas persistenta metadata, inte från en verifierad
          inventering av objektlagringen. Ekonomiska belopp visas inte.
        </Feedback>
      </>
    );
  }
  const state = data as AdminSecurity;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(
          [
            ["activeAdministrators", "Aktiva plattformsadministratörer"],
            ["suspendedUsers", "Avstängda användare"],
            ["inactiveGrants", "Inaktiva plattformsroller"],
            ["pendingMfa", "Administratörer utan verifierad MFA"],
            ["revokedSessions", "Återkallade sessioner"],
            ["deniedLast24h", "Nekade säkerhetshändelser senaste dygnet"]
          ] as const
        ).map(([key, label]) => (
          <Panel key={key} className="p-5">
            <h2 className="text-sm text-muted">{label}</h2>
            <p className="mt-3 text-2xl font-semibold">{state[key]}</p>
          </Panel>
        ))}
      </div>
      <Panel className="space-y-3 p-5">
        <h2 className="font-semibold">Senaste nekade händelser (högst 20)</h2>
        {state.recent.map((event) => (
          <p className="text-sm" key={event.id}>
            {adminDate(event.timestamp)} · {event.actor?.displayName ?? "System"} · {event.action}
          </p>
        ))}
      </Panel>
      <Panel className="space-y-3 p-5">
        <h2 className="font-semibold">Roll- och credentialändringar (högst 20)</h2>
        {state.recentChanges.length === 0 && (
          <p className="text-sm text-muted">Inga registrerade ändringar.</p>
        )}
        {state.recentChanges.map((event) => (
          <p className="text-sm" key={event.id}>
            {adminDate(event.timestamp)} · {event.actor?.displayName ?? "System"} · {event.action}
          </p>
        ))}
        <p className="text-sm">
          MFA-kryptering: {state.mfaEncryptionConfigured ? "Konfigurerad" : "Saknas"}.
          E-postleverans:{" "}
          {state.notificationDeliveryConfigured ? "Konfigurerad" : "Inte konfigurerad"}.
        </p>
      </Panel>
      <Link className="underline" href="/admin/security-setup">
        Min MFA, step-up och säker återställning
      </Link>
      <Link className="ml-4 underline" href="/admin/audit">
        Full auditlogg
      </Link>
    </>
  );
}
interface AdminJob {
  id: string;
  status: string;
  createdAt: string;
  organizationId: string;
  organization: { name: string };
  initiatedByUserId: string | null;
}
interface AdminJobs {
  imports: AdminJob[];
  exports: AdminJob[];
  importCount: number;
  exportCount: number;
  page: number;
  pageSize: number;
}
export function AdminJobsPage() {
  const [page, setPage] = useState(1),
    [pageSize, setSize] = useState(25);
  const state = useAdminData<AdminJobs>(`/jobs?page=${page}&pageSize=${pageSize}`);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Import och export"
        context="Master Admin"
        description="Persistenta SIE-jobbstatusar, inte filinnehåll eller bokföringsrader. Importer kan inte bekräftas eller återförsökas här."
      />
      <AdminResult {...state} retry={state.reload}>
        {state.data &&
          (
            [
              ["Importer", state.data.imports, state.data.importCount],
              ["Exporter", state.data.exports, state.data.exportCount]
            ] as [string, AdminJob[], number][]
          ).map(([label, items, total]) => (
            <Panel className="space-y-3 p-5" key={label}>
              <h2 className="font-semibold">
                {label} · {total}
              </h2>
              <AdminTable
                label={label}
                headers={["Jobb-ID", "Företag", "Status", "Skapad", "Initierad av (ID)"]}
              >
                {items.map((job) => (
                  <tr key={job.id} className="border-b">
                    <td className="max-w-xs break-all p-3">{job.id}</td>
                    <td className="p-3">
                      <Link
                        href={`/admin/organizations/${job.organizationId}`}
                        className="underline"
                      >
                        {job.organization.name}
                      </Link>
                    </td>
                    <td className="p-3">{job.status}</td>
                    <td className="p-3">{adminDate(job.createdAt)}</td>
                    <td className="max-w-xs break-all p-3">{job.initiatedByUserId ?? "—"}</td>
                  </tr>
                ))}
              </AdminTable>
              {items.length === 0 && <p className="text-sm text-muted">Inga jobb på denna sida.</p>}
            </Panel>
          ))}
      </AdminResult>
      {state.data && (
        <AdminPagination
          page={page}
          pageSize={pageSize}
          total={Math.max(state.data.importCount, state.data.exportCount)}
          onPage={setPage}
          onPageSize={(value) => {
            setSize(value);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}

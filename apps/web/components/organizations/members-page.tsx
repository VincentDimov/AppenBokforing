"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PageHeader, roleLabels, LoadingState, EmptyState } from "@/components/ui/workspace";
import { useAuth } from "@/components/auth/auth-provider";
import { workspaceRequest } from "@/lib/workspace-api";
type Role = "OWNER" | "ADMIN" | "ACCOUNTANT" | "MEMBER" | "READ_ONLY";
const roles: Role[] = ["ADMIN", "ACCOUNTANT", "MEMBER", "READ_ONLY"];
interface Member {
  id: string;
  userId: string;
  role: Role;
  removedAt: string | null;
  createdAt: string;
  user: { displayName: string; email: string };
}
interface Invitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}
interface Members {
  members: Member[];
  invitations: Invitation[];
}
export function MembersPage() {
  const { activeOrganization } = useAuth();
  if (!activeOrganization) return <p>Välj organisation.</p>;
  return (
    <MemberManagement
      key={activeOrganization.id}
      org={activeOrganization.id}
      role={activeOrganization.role}
    />
  );
}
function MemberManagement({ org, role }: { org: string; role: Role }) {
  const { reloadOrganizations } = useAuth();
  const [data, setData] = useState<Members | null>(null);
  const [message, setMessage] = useState("");
  const [developmentUrl, setDevelopmentUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [pending, setPending] = useState<{
    title: string;
    description: string;
    path: string;
    method: string;
    body?: object;
  } | null>(null);
  const base = `/organizations/${org}`;
  const canManage = ["OWNER", "ADMIN"].includes(role);
  useEffect(() => {
    let live = true;
    workspaceRequest<Members>(`${base}/members`)
      .then((data) => {
        if (live) setData(data);
      })
      .catch((error) => {
        if (live) setMessage(error.message);
      });
    return () => {
      live = false;
    };
  }, [base]);
  async function action(path: string, method: string, body?: object) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    setDevelopmentUrl("");
    try {
      const response = await workspaceRequest<{ developmentInvitationUrl?: string }>(
        `${base}${path}`,
        { method, body: body ? JSON.stringify(body) : undefined }
      );
      if (response.developmentInvitationUrl) setDevelopmentUrl(response.developmentInvitationUrl);
      setData(await workspaceRequest<Members>(`${base}/members`));
      await reloadOrganizations();
      setMessage("Ändringen sparad.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunde inte spara.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action("/invitations", "POST", { email: form.get("email"), role: form.get("role") });
  }
  return (
    <section className="space-y-6">
      <PageHeader
        title="Medlemmar och inbjudningar"
        context="Inställningar"
        description="Hantera företagets medlemmar och deras åtkomst."
      />
      {canManage && (
        <form onSubmit={invite} className="my-5 flex flex-wrap items-end gap-3">
          <label>
            E-post
            <input className="block border p-2" type="email" name="email" required />
          </label>
          <label>
            Roll
            <select
              className="block border p-2"
              name="role"
              defaultValue="MEMBER"
              aria-label="Roll"
            >
              {roles.map((value) => (
                <option key={value} value={value}>
                  {roleLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded bg-accent p-3 text-white" disabled={busy}>
            Bjud in
          </button>
        </form>
      )}
      {developmentUrl && (
        <label className="block my-4">
          Endast utveckling/test: inbjudningslänk
          <input
            readOnly
            value={developmentUrl}
            className="block w-full border p-2"
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <p role="status">{message}</p>
      {!data && !message && <LoadingState label="Hämtar medlemmar…" />}
      <div className="table-frame" tabIndex={0}>
        <table className="my-5 w-full text-left">
          <thead>
            <tr>
              <th>Namn / e-post</th>
              <th>Roll</th>
              <th>Status</th>
              <th>Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            {data?.members.map((member) => (
              <tr key={member.id} className="border-t">
                <td className="p-3">
                  {member.user.displayName}
                  <br />
                  {member.user.email}
                  <br />
                  <small>{member.createdAt.slice(0, 10)}</small>
                </td>
                <td>
                  {canManage && !member.removedAt && member.role !== "OWNER" ? (
                    <select
                      aria-label={`Roll för ${member.user.email}`}
                      disabled={busy}
                      value={member.role}
                      onChange={(event) =>
                        setPending({
                          title: "Ändra behörighet?",
                          description: `${member.user.email} får rollen ${roleLabels[event.target.value]}. Ändringen påverkar åtkomsten till företaget.`,
                          path: `/members/${member.id}`,
                          method: "PATCH",
                          body: { role: event.target.value }
                        })
                      }
                    >
                      {roles.map((value) => (
                        <option key={value} value={value}>
                          {roleLabels[value]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    roleLabels[member.role]
                  )}
                </td>
                <td>{member.removedAt ? "Borttagen" : "Aktiv"}</td>
                <td>
                  {canManage && !member.removedAt && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setPending({
                            title: "Ta bort medlemskap?",
                            description: `${member.user.email} förlorar åtkomsten. Bokföringshistoriken behålls.`,
                            path: `/members/${member.id}`,
                            method: "DELETE"
                          });
                        }}
                      >
                        Ta bort
                      </button>
                      {role === "OWNER" && member.role !== "OWNER" && (
                        <button
                          className="ml-3"
                          disabled={busy}
                          onClick={() => {
                            setPending({
                              title: "Överför ägarskapet?",
                              description: `${member.user.email} blir ägare. Du får rollen Administratör.`,
                              path: "/transfer-ownership",
                              method: "POST",
                              body: { memberId: member.id }
                            });
                          }}
                        >
                          Överför ägarskap
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="text-lg font-semibold">Inbjudningar</h2>
      {data && !data.invitations.length && (
        <EmptyState
          title="Inga inbjudningar"
          description="Aktiva och tidigare inbjudningar visas här."
        />
      )}
      <ul>
        {data?.invitations.map((invite) => (
          <li className="my-3" key={invite.id}>
            {invite.email} · {roleLabels[invite.role]} ·{" "}
            {invite.acceptedAt
              ? "Accepterad"
              : invite.revokedAt
                ? "Återkallad"
                : new Date(invite.expiresAt) <= new Date()
                  ? "Utgången"
                  : "Väntar"}
            {canManage && !invite.acceptedAt && !invite.revokedAt && (
              <>
                <button
                  className="ml-3"
                  disabled={busy}
                  onClick={() =>
                    setPending({
                      title: "Återkalla inbjudan?",
                      description: `Inbjudningslänken för ${invite.email} slutar att fungera.`,
                      path: `/invitations/${invite.id}`,
                      method: "DELETE"
                    })
                  }
                >
                  Återkalla
                </button>
                <button
                  className="ml-3"
                  disabled={busy}
                  onClick={() =>
                    void action("/invitations", "POST", { email: invite.email, role: invite.role })
                  }
                >
                  Skicka igen
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.title ?? "Bekräfta ändring"}
        description={pending?.description}
        confirmLabel="Genomför ändringen"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const next = pending;
          setPending(null);
          if (next) void action(next.path, next.method, next.body);
        }}
      />
    </section>
  );
}

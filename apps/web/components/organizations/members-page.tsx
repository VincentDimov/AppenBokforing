"use client";
import { useEffect, useState, type FormEvent } from "react";
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
      setBusy(false);
    }
  }
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action("/invitations", "POST", { email: form.get("email"), role: form.get("role") });
  }
  return (
    <section className="rounded-xl bg-white p-6">
      <h1 className="text-2xl font-semibold">Medlemmar och inbjudningar</h1>
      {canManage && (
        <form onSubmit={invite} className="my-5 flex flex-wrap gap-3">
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
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <button className="rounded bg-[#17384b] p-3 text-white" disabled={busy}>
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
                      void action(`/members/${member.id}`, "PATCH", { role: event.target.value })
                    }
                  >
                    {roles.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                ) : (
                  member.role
                )}
              </td>
              <td>{member.removedAt ? "Borttagen" : "Aktiv"}</td>
              <td>
                {canManage && !member.removedAt && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Ta bort ${member.user.email} från organisationen?`))
                          void action(`/members/${member.id}`, "DELETE");
                      }}
                    >
                      Ta bort
                    </button>
                    {role === "OWNER" && member.role !== "OWNER" && (
                      <button
                        className="ml-3"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(`Överför ägarskapet till ${member.user.email}? Du blir ADMIN.`)
                          )
                            void action("/transfer-ownership", "POST", { memberId: member.id });
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
      <h2 className="text-lg font-semibold">Inbjudningar</h2>
      <ul>
        {data?.invitations.map((invite) => (
          <li className="my-3" key={invite.id}>
            {invite.email} · {invite.role} ·{" "}
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
                  onClick={() => void action(`/invitations/${invite.id}`, "DELETE")}
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
    </section>
  );
}

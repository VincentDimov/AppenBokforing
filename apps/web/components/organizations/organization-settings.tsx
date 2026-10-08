"use client";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { workspaceRequest } from "@/lib/workspace-api";

export function OrganizationSettings() {
  const { activeOrganization, reloadOrganizations } = useAuth();
  if (!activeOrganization) return <p>Välj organisation.</p>;
  return (
    <OrganizationForm
      key={activeOrganization.id}
      organization={activeOrganization}
      reload={reloadOrganizations}
    />
  );
}
function OrganizationForm({
  organization,
  reload
}: {
  organization: NonNullable<ReturnType<typeof useAuth>["activeOrganization"]>;
  reload: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canWrite = ["OWNER", "ADMIN"].includes(organization.role);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      await workspaceRequest(`/organizations/${organization.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          organizationNumber: form.get("organizationNumber") || undefined,
          address: form.get("address")
        })
      });
      await reload();
      setMessage("Organisationen sparad.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunde inte spara.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="max-w-2xl rounded-xl bg-white p-6">
      <h1 className="text-2xl font-semibold">Organisation</h1>
      <p className="my-3">
        Identitet och valuta låses efter bokföringsstart. Organisationsnummer är endast
        formatkontrollerat.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={!canWrite || busy} className="space-y-4">
          <label className="block">
            Namn
            <input
              name="name"
              defaultValue={organization.name}
              required
              maxLength={160}
              className="block w-full border p-2"
            />
          </label>
          <label className="block">
            Organisationsnummer
            <input
              name="organizationNumber"
              defaultValue={organization.organizationNumber ?? ""}
              pattern="[0-9]{6}-?[0-9]{4}"
              className="block w-full border p-2"
            />
          </label>
          <label className="block">
            Adress
            <input
              name="address"
              defaultValue={organization.address ?? ""}
              maxLength={500}
              className="block w-full border p-2"
            />
          </label>
          <p>
            {organization.countryCode ?? "SE"} · {organization.defaultCurrency}
          </p>
          {canWrite && (
            <button className="rounded bg-[#17384b] p-3 text-white">Spara organisation</button>
          )}
        </fieldset>
        <p role="status">{message}</p>
      </form>
    </section>
  );
}

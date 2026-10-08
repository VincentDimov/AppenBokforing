"use client";
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Feedback } from "@/components/ui/workspace";
import { adminRequest } from "@/lib/platform-admin";

export function useAdminWrite() {
  const { user } = useAuth();
  return user?.platformRole === "SUPER_ADMIN" || user?.platformRole === "PLATFORM_ADMIN";
}
export const adminInput = "mt-1 block w-full rounded-md border bg-surface p-3 text-sm";
export function AdminAction({
  label,
  path,
  method = "POST",
  target,
  consequence,
  children,
  payload,
  done,
  disabled = false
}: {
  label: string;
  path: string | ((form: FormData) => string);
  method?: string;
  target?: string;
  consequence: string;
  children?: ReactNode;
  payload: (form: FormData) => Record<string, unknown>;
  done: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = new FormData(event.currentTarget);
    if (target && form.get("confirmation") !== target) {
      setError("Bekräftelsen matchar inte målidentifieraren.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await adminRequest(typeof path === "function" ? path(form) : path, {
        method,
        body: JSON.stringify({ ...payload(form), ...(target ? { confirmation: target } : {}) })
      });
      setOpen(false);
      done();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Åtgärden kunde inte sparas.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (!pending.current) setOpen(false);
        }}
        title={label}
        busy={busy}
      >
        {open && (
          <form className="space-y-4" onSubmit={submit}>
            <p className="text-sm text-muted">{consequence}</p>
            {children}
            {target && (
              <label className="block text-sm">
                Skriv {target} för att bekräfta
                <input className={adminInput} name="confirmation" required autoComplete="off" />
              </label>
            )}
            {error && <Feedback kind="error">{error}</Feedback>}
            <p className="text-sm text-muted">
              Känsliga ändringar kräver MFA verifierad de senaste fem minuterna.{" "}
              <Link href="/admin/security-setup" className="underline">
                Verifiera igen
              </Link>
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Avbryt
              </Button>
              <Button disabled={busy}>{busy ? "Sparar…" : "Spara"}</Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
export function UserPicker({
  name = "userId",
  label = "Användar-ID"
}: {
  name?: string;
  label?: string;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        name={name}
        className={adminInput}
        required
        pattern="[0-9a-fA-F-]{36}"
        placeholder="UUID från användarprofilen"
      />
      <span className="text-xs text-muted">
        Hämta identifieraren från{" "}
        <Link className="underline" href="/admin/users" target="_blank" rel="noopener noreferrer">
          användarlistan (ny flik)
        </Link>
        . Inga användare väljs automatiskt.
      </span>
    </label>
  );
}

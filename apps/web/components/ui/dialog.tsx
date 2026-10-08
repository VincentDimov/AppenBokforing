"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

/** Native modal supplies the focus trap and background inertness in supported browsers. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  busy = false
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cn("workspace-dialog", className)}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="dialog-header">
        <h2 id={titleId}>{title}</h2>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          disabled={busy}
          aria-label="Stäng dialog"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Bekräfta",
  onCancel,
  onConfirm,
  busy,
  disabled
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Dialog open={open} title={title} onClose={onCancel} busy={busy}>
      <div className="dialog-body">{description}</div>
      <div className="dialog-actions">
        <Button autoFocus variant="outline" type="button" disabled={busy} onClick={onCancel}>
          Avbryt
        </Button>
        <Button type="button" disabled={busy || disabled} onClick={onConfirm}>
          {busy ? "Arbetar…" : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

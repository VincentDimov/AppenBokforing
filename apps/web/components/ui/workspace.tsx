import { FileText, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";

export function PageHeader({
  title,
  context,
  description,
  action
}: {
  title: string;
  context?: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        {context && <p className="page-context">{context}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </header>
  );
}
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("surface-panel", className)}>{children}</section>;
}
export function TableFrame({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div
      className="table-frame"
      role={label ? "region" : undefined}
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
export function Feedback({
  children,
  kind = "info",
  action
}: {
  children: ReactNode;
  kind?: "info" | "error" | "success" | "warning";
  action?: ReactNode;
}) {
  return (
    <div className={`feedback feedback-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <div>{children}</div>
      {action}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <FileText className="size-6 text-muted" aria-hidden="true" />
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function LoadingState({ label = "Hämtar…" }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}
export const roleLabels: Record<string, string> = {
  OWNER: "Ägare",
  ADMIN: "Administratör",
  ACCOUNTANT: "Redovisare",
  MEMBER: "Medlem",
  READ_ONLY: "Läsbehörighet"
};
const statuses: Record<
  string,
  { label: string; variant: "success" | "warning" | "outline" | "default" }
> = {
  DRAFT: { label: "Utkast", variant: "warning" },
  POSTED: { label: "Bokförd", variant: "success" },
  REVERSED: { label: "Rättad", variant: "outline" },
  OPEN: { label: "Öppen", variant: "success" },
  LOCKED: { label: "Låst", variant: "warning" },
  CLOSED: { label: "Stängt", variant: "outline" },
  COMPLETED: { label: "Slutförd", variant: "success" },
  CONFIRMED: { label: "Bekräftad", variant: "success" },
  FAILED: { label: "Misslyckad", variant: "warning" },
  PREVIEW: { label: "Förhandsvisning", variant: "default" }
};
export function StatusBadge({ status }: { status: string }) {
  const value = statuses[status];
  return <Badge variant={value?.variant ?? "outline"}>{value?.label ?? status}</Badge>;
}

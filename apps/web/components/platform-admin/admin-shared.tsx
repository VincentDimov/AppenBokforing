"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Feedback, LoadingState, EmptyState, TableFrame } from "@/components/ui/workspace";

export function AdminResult({
  loading,
  error,
  retry,
  empty,
  children
}: {
  loading: boolean;
  error: string;
  retry: () => void;
  empty?: boolean;
  children: ReactNode;
}) {
  if (loading)
    return (
      <>
        <LoadingState label="Hämtar administration…" />
        <div aria-hidden="true" className="space-y-3 rounded-lg border p-5">
          {[1, 2, 3].map((row) => (
            <div key={row} className="h-8 rounded bg-subtle" />
          ))}
        </div>
      </>
    );
  if (error)
    return (
      <Feedback kind="error" action={<Button onClick={retry}>Försök igen</Button>}>
        {error}
      </Feedback>
    );
  if (empty) return <EmptyState title="Inga träffar" description="Ändra sökning eller filter." />;
  return <>{children}</>;
}
export function AdminPagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
      <p aria-live="polite">
        {total} träffar · Sida {page} av {Math.max(1, Math.ceil(total / pageSize))}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label>
          Rader{" "}
          <select
            className="rounded border bg-surface p-2"
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
        <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Föregående
        </Button>
        <Button
          variant="outline"
          disabled={page * pageSize >= total || page >= 200}
          onClick={() => onPage(page + 1)}
        >
          Nästa
        </Button>
      </div>
    </div>
  );
}
export function AdminTable({
  headers,
  children,
  label
}: {
  headers: string[];
  children: ReactNode;
  label: string;
}) {
  return (
    <TableFrame label={label}>
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead>
          <tr>
            {headers.map((header) => (
              <th className="border-b px-4 py-3 font-medium text-muted" scope="col" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </TableFrame>
  );
}

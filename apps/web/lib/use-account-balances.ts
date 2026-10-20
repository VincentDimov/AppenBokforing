"use client";

import { useEffect, useState } from "react";
import { workspaceRequest } from "./workspace-api";
import { formatOre } from "./vouchers";

type Result = {
  organizationId: string;
  fiscalYearId: string;
  date: string;
  accounts: { accountId: string; balance: string }[];
};

export function useAccountBalances(
  organizationId: string,
  fiscalYearId: string | undefined,
  date: string,
  accountIds: string[],
  revision: string
) {
  const ids = [...new Set(accountIds)].sort().join(",");
  const key = JSON.stringify([organizationId, fiscalYearId, date, ids, revision]);
  const enabled = Boolean(
    organizationId && fiscalYearId && /^\d{4}-\d{2}-\d{2}$/.test(date) && ids
  );
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; values: Map<string, string>; error: string }>({
    key: "",
    values: new Map(),
    error: ""
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ key: "", values: new Map(), error: "" });
    // Batch unique accounts, not requests on every amount keystroke or duplicate row.
    const timer = setTimeout(() => {
      void (async () => {
        const requested = ids.split(",");
        const values = new Map<string, string>();
        for (let start = 0; start < requested.length; start += 300) {
          const batches = [];
          for (
            let offset = start;
            offset < Math.min(start + 300, requested.length);
            offset += 100
          ) {
            const batch = requested.slice(offset, offset + 100);
            batches.push(
              (async () => {
                const query = new URLSearchParams({
                  organizationId,
                  fiscalYearId: fiscalYearId!,
                  date,
                  accountIds: batch.join(",")
                });
                const result = await workspaceRequest<Result>(`/accounts/balances?${query}`, {
                  signal: controller.signal
                });
                if (
                  result.organizationId !== organizationId ||
                  result.fiscalYearId !== fiscalYearId ||
                  result.date !== date ||
                  !Array.isArray(result.accounts) ||
                  result.accounts.length !== batch.length
                )
                  throw new Error("Kontosaldot kunde inte verifieras.");
                const expected = new Set(batch);
                for (const row of result.accounts) {
                  if (
                    !expected.delete(row.accountId) ||
                    typeof row.balance !== "string" ||
                    !/^-?\d+\.\d{2}$/.test(row.balance)
                  )
                    throw new Error("Kontosaldot kunde inte verifieras.");
                  values.set(row.accountId, formatOre(BigInt(row.balance.replace(".", ""))));
                }
              })()
            );
          }
          await Promise.all(batches);
          if (controller.signal.aborted) return;
        }
        if (!controller.signal.aborted) setState({ key, values, error: "" });
      })().catch(() => {
        if (!controller.signal.aborted)
          setState({
            key,
            values: new Map(),
            error: "Kontosaldon kunde inte hämtas. Försök uppdatera saldona igen."
          });
      });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [organizationId, fiscalYearId, date, ids, revision, key, enabled, retry]);

  return {
    values: enabled && state.key === key ? state.values : new Map<string, string>(),
    error: enabled && state.key === key ? state.error : "",
    loading: enabled && state.key !== key,
    refresh: () => setRetry((value) => value + 1)
  };
}

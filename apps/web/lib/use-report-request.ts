"use client";

import { useEffect, useRef, useState } from "react";

/** Used inside organization-keyed report components: no state survives a tenant switch. */
export function useReportRequest<T>() {
  const [report, setReport] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    []
  );

  async function load(url: string) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setReport(null);
    setError(null);
    try {
      const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal
      });
      const body: unknown = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        throw new Error(
          typeof body === "object" &&
            body !== null &&
            "message" in body &&
            typeof body.message === "string"
            ? body.message
            : "Rapporten kunde inte laddas."
        );
      }
      setReport(body as T);
    } catch (caughtError) {
      if (!controller.signal.aborted)
        setError(
          caughtError instanceof Error ? caughtError.message : "Rapporten kunde inte laddas."
        );
    }
  }
  return { report, error, setError, load };
}

"use client";

import { useEffect, useRef, useState } from "react";

/** Used inside organization-keyed report components: no state survives a tenant switch. */
export function useReportRequest<T>() {
  const [report, setReport] = useState<T | null>(null);
  const [loadedUrl, setLoadedUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
    setLoading(true);
    setReport(null);
    setLoadedUrl("");
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
      setLoadedUrl(url);
    } catch (caughtError) {
      if (!controller.signal.aborted)
        setError(
          caughtError instanceof Error ? caughtError.message : "Rapporten kunde inte laddas."
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  return { report, error, setError, load, loadedUrl, loading };
}

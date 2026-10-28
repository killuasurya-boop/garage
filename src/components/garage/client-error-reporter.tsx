"use client";

import { useEffect } from "react";

import { CHUNK_RELOAD_KEY, isChunkLoadError, shouldReloadForChunk } from "@/lib/chunk-reload";

// Lightweight client error reporter — pasang sekali di layout root.
// Tangkap window.onerror + unhandledrejection, POST ke /api/errors.
// Debounced agar tidak spam (sama event ditahan 5 dtk).
export function ClientErrorReporter() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const recentKeys = new Map<string, number>();
    const DEBOUNCE_MS = 5_000;

    const report = (
      message: string,
      source: string,
      stack?: string,
      context?: Record<string, unknown>,
    ) => {
      const key = `${source}::${message.slice(0, 200)}`;
      const now = Date.now();
      const last = recentKeys.get(key);
      if (last && now - last < DEBOUNCE_MS) return;
      recentKeys.set(key, now);

      // Best-effort POST; abaikan error dari error logger sendiri.
      try {
        void fetch("/api/errors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            source,
            stack,
            url: window.location.href,
            userAgent: navigator.userAgent,
            context,
          }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* ignore */
      }
    };

    // File JS versi lama hilang setelah deploy → muat ulang sekali (lihat chunk-reload.ts).
    const reloadForNewVersion = (error: { name?: string; message?: string } | null | undefined) => {
      if (!isChunkLoadError(error)) return;
      try {
        const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY));
        const now = Date.now();
        if (!shouldReloadForChunk(last || null, now)) return;
        window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
      } catch {
        return; // sessionStorage diblokir → jangan reload (hindari loop).
      }
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      report(
        event.message || "Unknown error",
        event.filename || "window.onerror",
        event.error?.stack,
        { lineno: event.lineno, colno: event.colno },
      );
      reloadForNewVersion(event.error ?? { message: event.message });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";
      const stack = reason instanceof Error ? reason.stack : undefined;
      report(message, "unhandledrejection", stack);
      reloadForNewVersion(reason instanceof Error ? reason : { message });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

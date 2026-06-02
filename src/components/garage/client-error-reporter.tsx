"use client";

import { useEffect } from "react";

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

    const onError = (event: ErrorEvent) => {
      report(
        event.message || "Unknown error",
        event.filename || "window.onerror",
        event.error?.stack,
        { lineno: event.lineno, colno: event.colno },
      );
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

"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

// AutoLogoutWatcher — global idle watchdog yang sign-out user setelah X menit
// tanpa interaksi. Dimount di RootLayout. Threshold dibaca dari setting
// `security.idle_logout_minutes`. Disabled di route public (login, member, dll).

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/pos-login",
  "/member-login",
  "/member",
  "/invoice",
  "/franchise",
  "/order",
  "/display",
  "/api",
];

const ACTIVITY_EVENTS: Array<keyof DocumentEventMap> = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
];

export function AutoLogoutWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const lastActivityRef = useRef<number>(0);
  const timeoutMsRef = useRef<number>(0);

  // Skip di public path
  const isPublic = pathname
    ? pathname === "/" || PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    : true;

  useEffect(() => {
    if (isPublic) return;

    let cancelled = false;
    let checkInterval: ReturnType<typeof setInterval> | null = null;
    lastActivityRef.current = Date.now();

    // Fetch idle timeout setting dari server. /api/settings (GET) terbaca semua
    // staff login — termasuk Kasir/Waiter di tablet bersama, yang paling butuh
    // auto-logout. (Dulu /api/admin/settings → 403 untuk Kasir → tidak pernah aktif.)
    async function loadTimeout() {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) {
          timeoutMsRef.current = 0;
          return;
        }
        const json = await res.json();
        const minutes = Number(json?.data?.settings?.["securityIdleLogoutMinutes"] ?? 0);
        timeoutMsRef.current = minutes > 0 ? minutes * 60 * 1000 : 0;
      } catch {
        timeoutMsRef.current = 0;
      }
    }

    function bumpActivity() {
      lastActivityRef.current = Date.now();
    }

    async function check() {
      if (cancelled) return;
      if (timeoutMsRef.current <= 0) return;
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= timeoutMsRef.current) {
        // Cegah double-trigger
        timeoutMsRef.current = 0;
        try {
          await fetch("/api/auth/sign-out", { method: "POST" });
        } catch {
          // ignore network error
        }
        // Tablet kasir kembali ke login POS, bukan login dashboard.
        const loginPath = pathname?.startsWith("/pos") ? "/pos-login" : "/login";
        // Login OS membawa halaman terakhir (next) supaya karyawan kembali ke modul yang
        // sama; /login memvalidasi target lewat safeReturnTo.
        const next =
          loginPath === "/login"
            ? `&next=${encodeURIComponent(window.location.pathname + window.location.search)}`
            : "";
        router.replace(`${loginPath}?reason=idle_timeout${next}`);
      }
    }

    loadTimeout();

    for (const eventName of ACTIVITY_EVENTS) {
      document.addEventListener(eventName, bumpActivity, { passive: true });
    }
    checkInterval = setInterval(check, 30_000); // cek tiap 30 detik

    return () => {
      cancelled = true;
      if (checkInterval) clearInterval(checkInterval);
      for (const eventName of ACTIVITY_EVENTS) {
        document.removeEventListener(eventName, bumpActivity);
      }
    };
  }, [isPublic, pathname, router]);

  return null;
}

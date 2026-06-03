import { toNextJsHandler } from "better-auth/next-js";

import { ensureDatabaseReady } from "@/db";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const handlers = toNextJsHandler(auth);

// Path-aware rate-limit (Fase 4 Security Hardening):
// - sign-in: 10/menit/IP  (cegah brute-force)
// - reset-password / forget-password: 5/menit/IP
// - sign-up: 6/menit/IP  (cegah spam akun)
// - lainnya: tidak dibatasi (mencakup verify, callback, getSession ringan)
function authRateLimit(request: Request): Response | null {
  const pathname = new URL(request.url).pathname;
  if (pathname.includes("/sign-in")) {
    return rateLimit(request, "auth-sign-in", { limit: 10, windowMs: 60_000 });
  }
  if (pathname.includes("/forget-password") || pathname.includes("/reset-password")) {
    return rateLimit(request, "auth-reset", { limit: 5, windowMs: 60_000 });
  }
  if (pathname.includes("/sign-up")) {
    return rateLimit(request, "auth-sign-up", { limit: 6, windowMs: 60_000 });
  }
  return null;
}

export async function GET(request: Request) {
  await ensureDatabaseReady();
  return handlers.GET(request);
}

export async function POST(request: Request) {
  const limited = authRateLimit(request);
  if (limited) return limited;
  await ensureDatabaseReady();
  return handlers.POST(request);
}

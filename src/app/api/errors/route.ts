import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Error logger lite — terima error dari client/browser & catat ke audit_logs.
// Tidak butuh auth karena report bisa terjadi pada halaman publik (mis. /login).
// Rate-limit ringan in-memory per IP supaya tidak spam.
//
// Sentry/Datadog bisa di-plug-in nanti — interface tetap sama untuk client.

const errorSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  source: z.string().trim().min(1).max(200).optional(),
  stack: z.string().trim().max(4000).optional(),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

const buckets = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

function rateLimit(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  b.count += 1;
  return b.count <= MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (!rateLimit(ip)) {
    return fail(429, "RATE_LIMITED", "Terlalu banyak laporan error dari IP ini.");
  }

  const body = await readJson(request, errorSchema);
  if (body.error) return body.error;

  try {
    const db = await getDb();
    await db.insert(auditLogs).values({
      time: new Date().toISOString(),
      actor: "client",
      action: "client_error",
      object: body.data.source ?? body.data.url ?? "unknown",
      device: body.data.userAgent?.slice(0, 80) ?? "browser",
      status: "warning",
      metadata: {
        message: body.data.message,
        stack: body.data.stack,
        url: body.data.url,
        userAgent: body.data.userAgent,
        ip,
        context: body.data.context,
      },
    });
    return ok({ logged: true });
  } catch (err) {
    // Jangan gagal-keras — error logger yang gagal tidak boleh memberatkan client.
    console.error("client error logging failed:", err);
    return ok({ logged: false });
  }
}

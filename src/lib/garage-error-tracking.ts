// Error tracking — DB-backed dengan API yang kompatibel ke Sentry-style.
// Upgrade path: ganti recordError() ke Sentry.captureException kalau perlu.

import { createHash } from "node:crypto";

import { getDb, isDatabaseConfigured } from "@/db";
import { errorEvents } from "@/db/schema";

export type ErrorContext = {
  source: "api" | "client" | "job";
  route?: string;
  method?: string;
  userId?: string;
  userRole?: string;
  statusCode?: number;
  requestId?: string;
  metadata?: Record<string, unknown>;
};

function fingerprintFor(message: string, route?: string): string {
  // Hash msg+route untuk group duplicate (sama seperti Sentry fingerprint).
  return createHash("sha1")
    .update(`${route ?? ""}::${message.slice(0, 200)}`)
    .digest("hex")
    .slice(0, 16);
}

export async function recordError(
  error: unknown,
  context: ErrorContext,
): Promise<void> {
  if (!isDatabaseConfigured()) {
    // Tanpa DB, fallback ke console biar gak hilang
    console.error("[Garage error tracker]", context.source, context.route, error);
    return;
  }

  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
  const stack = error instanceof Error ? error.stack : undefined;

  try {
    await getDb()
      .insert(errorEvents)
      .values({
        source: context.source,
        route: context.route,
        method: context.method,
        userId: context.userId,
        userRole: context.userRole,
        message: message.slice(0, 2000),
        stackTrace: stack?.slice(0, 8000),
        statusCode: context.statusCode,
        requestId: context.requestId,
        metadata: context.metadata,
        fingerprint: fingerprintFor(message, context.route),
      });
  } catch (insertErr) {
    // Error tracking gagal — fallback ke console, jangan loop
    console.error("[Garage error tracker insert failed]", insertErr);
    console.error("[Original error]", error);
  }
}

// Wrapper untuk API route handlers — auto-catch + record.
// Pemakaian:
//   export const POST = withErrorTracking(async (req) => { ... });
export function withErrorTracking<T extends (...args: never[]) => Promise<Response>>(
  handler: T,
  options: { route: string },
): T {
  return (async (...args: Parameters<T>) => {
    const request = args[0] as Request | undefined;
    const method = request?.method ?? "UNKNOWN";
    try {
      return await handler(...args);
    } catch (error) {
      await recordError(error, {
        source: "api",
        route: options.route,
        method,
        statusCode: 500,
      });
      throw error;
    }
  }) as T;
}

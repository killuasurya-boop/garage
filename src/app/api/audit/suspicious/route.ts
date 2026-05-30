import { ok } from "@/lib/api-response";
import { getSuspiciousActivity } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("audit:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const rawHours = url.searchParams.get("hours");
  const windowHours = rawHours ? Number(rawHours) : undefined;

  return ok(
    await getSuspiciousActivity({
      windowHours: Number.isFinite(windowHours) ? windowHours : undefined,
    }),
  );
}

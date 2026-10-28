import { z } from "zod";

import { accountabilityFailure } from "@/lib/accountability-route";
import { fail, ok, readJson } from "@/lib/api-response";
import { listRiskAlerts, scanRecentRisk } from "@/lib/risk-engine";
import { RISK_DISPOSITIONS } from "@/lib/risk-rules";
import { rateLimit } from "@/lib/rate-limit";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const listSchema = z.object({
  disposition: z.enum(["ALL", ...RISK_DISPOSITIONS] as [string, ...string[]]).optional(),
  minLevel: z.coerce.number().int().min(1).max(5).optional(),
});

/** B6: daftar alert risiko (Owner semua; Manajer outletnya). */
export async function GET(request: Request) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const parsed = listSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return fail(400, "INVALID_QUERY", parsed.error.issues[0]?.message ?? "Parameter tidak valid.");
  try {
    return ok({ alerts: await listRiskAlerts(parsed.data as never, session.data) });
  } catch (error) {
    return accountabilityFailure(error);
  }
}

const scanSchema = z.object({ days: z.number().int().min(1).max(90).optional() });

/** Pindai ulang shift yang sudah ditutup (Owner). */
export async function POST(request: Request) {
  const limited = rateLimit(request, "risk-scan", { limit: 4, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  if (session.data.profile.role !== "Owner") return fail(403, "OWNER_ONLY", "Pindai ulang hanya oleh Owner.");
  const body = await readJson(request, scanSchema);
  if (body.error) return body.error;
  return ok(await scanRecentRisk({ days: body.data.days ?? 7 }));
}

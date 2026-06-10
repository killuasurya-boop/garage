import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createServiceRequest } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const serviceRequestSchema = z.object({
  tableLabel: z.string().trim().min(1).max(40),
  outletId: z.string().uuid().optional(),
  type: z.enum(["call", "bill", "water", "other"]).default("call"),
  note: z.string().trim().max(160).optional(),
});

// Panggilan pelayan dari meja (publik, tanpa login). Rate-limit ketat +
// dedup 60 detik di service layer untuk cegah spam.
export async function POST(request: Request) {
  const limited = rateLimit(request, "service-requests", { limit: 12, windowMs: 60_000 });
  if (limited) return limited;

  const body = await readJson(request, serviceRequestSchema);
  if (body.error) {
    return body.error;
  }

  const result = await createServiceRequest(body.data);
  return ok(result, { status: 201 });
}

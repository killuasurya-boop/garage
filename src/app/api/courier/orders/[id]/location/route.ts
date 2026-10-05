import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { CourierError, updateCourierLocation } from "@/lib/garage-courier";
import { rateLimit } from "@/lib/rate-limit";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

// GPS kurir tiap ±15 detik selama pengantaran (hanya kurir yang ditugaskan).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "courier-location", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requireGarageSession();
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    return ok(await updateCourierLocation(id, body.data.lat, body.data.lng, session.data));
  } catch (error) {
    if (error instanceof CourierError) return fail(error.status, "COURIER_LOCATION_FAILED", error.message);
    return fail(500, "COURIER_LOCATION_FAILED", error instanceof Error ? error.message : "Lokasi gagal dikirim.");
  }
}

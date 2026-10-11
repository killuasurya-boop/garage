import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { CourierError, setCourierAvailability } from "@/lib/garage-courier";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  available: z.boolean(),
  courierUserId: z.string().min(1).max(80).optional(),
});

// Kurir: "Siap antar" (Tersedia) / "Istirahat" (Offline). Owner/Manajer boleh untuk kurir lain.
export async function POST(request: Request) {
  const session = await requireGarageSession();
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  try {
    return ok(await setCourierAvailability(body.data, session.data));
  } catch (error) {
    if (error instanceof CourierError) return fail(error.status, "COURIER_AVAILABILITY_FAILED", error.message);
    return fail(500, "COURIER_AVAILABILITY_FAILED", "Status kurir gagal diubah.");
  }
}

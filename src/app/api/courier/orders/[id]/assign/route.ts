import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { assignCourier, CourierError } from "@/lib/garage-courier";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ courierUserId: z.string().trim().min(1).max(120).nullable() });

// Kasir/Manajer/Owner menugaskan kurir (null = lepas penugasan).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession();
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    return ok(await assignCourier(id, body.data.courierUserId, session.data));
  } catch (error) {
    if (error instanceof CourierError) return fail(error.status, "COURIER_ASSIGN_FAILED", error.message);
    return fail(500, "COURIER_ASSIGN_FAILED", "Gagal menugaskan kurir.");
  }
}

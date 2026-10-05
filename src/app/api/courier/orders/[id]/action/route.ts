import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { CourierError, courierDeliveryAction } from "@/lib/garage-courier";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ action: z.enum(["pickup", "depart", "arrive"]) });

// Kurir: Ambil pesanan → Mulai antar → Sudah sampai.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession();
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    return ok(await courierDeliveryAction(id, body.data.action, session.data));
  } catch (error) {
    if (error instanceof CourierError) return fail(error.status, "COURIER_ACTION_FAILED", error.message);
    return fail(500, "COURIER_ACTION_FAILED", error instanceof Error ? error.message : "Status antar gagal diubah.");
  }
}

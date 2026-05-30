import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { voidOrder } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const voidSchema = z.object({
  reason: z.string().trim().min(3).max(200),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Void/refund cuma boleh oleh role dengan finance:write (Manager / Finance / Owner)
  const session = await requirePermission("finance:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, voidSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  try {
    const result = await voidOrder(id, body.data.reason, session.data);
    return ok(result);
  } catch (error) {
    return fail(
      400,
      "ORDER_VOID_FAILED",
      error instanceof Error ? error.message : "Gagal void order.",
    );
  }
}

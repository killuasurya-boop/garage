import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { requestOrderVoidApproval } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const voidRequestSchema = z.object({
  reason: z.string().trim().min(3).max(200),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("orders:manage");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, voidRequestSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  try {
    const result = await requestOrderVoidApproval(
      id,
      body.data.reason,
      session.data,
    );
    return ok(result);
  } catch (error) {
    return fail(
      400,
      "ORDER_VOID_REQUEST_FAILED",
      error instanceof Error
        ? error.message
        : "Gagal mengajukan void ke approval.",
    );
  }
}

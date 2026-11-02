import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { cancelProductionBatch, completeProductionBatch } from "@/lib/garage-production";
import { productionErrorResponse } from "@/lib/garage-production-http";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const batchActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("complete"),
    // Allocation yang sudah dicocokkan operator ke Nama + Meja + Order.
    allocationIds: z.array(z.string().uuid()).max(60),
  }),
  z.object({
    // V4: selesaikan sebagian porsi (min. 1); batch tetap berjalan sampai semua selesai.
    action: z.literal("complete_partial"),
    allocationIds: z.array(z.string().uuid()).min(1).max(60),
  }),
  z.object({
    action: z.literal("cancel"),
    reason: z.string().trim().min(3).max(200),
  }),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("kitchen:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, batchActionSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  try {
    if (body.data.action === "complete") {
      return ok(await completeProductionBatch(id, body.data.allocationIds, session.data));
    }
    if (body.data.action === "complete_partial") {
      return ok(await completeProductionBatch(id, body.data.allocationIds, session.data, { partial: true }));
    }
    return ok(await cancelProductionBatch(id, body.data.reason, session.data));
  } catch (error) {
    const response = productionErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

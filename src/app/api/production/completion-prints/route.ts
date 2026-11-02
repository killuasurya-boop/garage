import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { completionPrintErrorResponse } from "@/lib/garage-production-http";
import {
  listCompletionPrints,
  reprintOrderCompletion,
} from "@/lib/production-completion-print";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Antrean tiket SELESAI (Production Hub V4) outlet ini, 12 jam terakhir.
export async function GET() {
  const session = await requirePermission("kitchen:read");
  if (session.response) {
    return session.response;
  }
  return ok(await listCompletionPrints(session.data));
}

const reprintSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().min(3).max(120),
});

// Cetak ulang terkendali (alasan wajib, dibatasi untuk non-manajer, diaudit).
export async function POST(request: Request) {
  const session = await requirePermission("kitchen:write");
  if (session.response) {
    return session.response;
  }
  const body = await readJson(request, reprintSchema);
  if (body.error) {
    return body.error;
  }
  try {
    return ok(await reprintOrderCompletion(body.data.orderId, body.data.reason, session.data), { status: 201 });
  } catch (error) {
    const response = completionPrintErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

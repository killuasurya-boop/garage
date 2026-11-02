import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { getProductionBatchHistory, startProductionBatch } from "@/lib/garage-production";
import { productionErrorResponse } from "@/lib/garage-production-http";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const startSchema = z.object({
  ticketItemIds: z.array(z.string().uuid()).min(2).max(60),
});

// MULAI BATCH: gabungkan porsi kompatibel lintas order jadi satu siklus
// produksi. Allocation per porsi dibuat saat itu juga.
export async function POST(request: Request) {
  const session = await requirePermission("kitchen:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, startSchema);
  if (body.error) {
    return body.error;
  }

  try {
    return ok(await startProductionBatch(body.data.ticketItemIds, session.data));
  } catch (error) {
    const response = productionErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

// Riwayat batch per hari (V4 Batch Produksi → tab Riwayat Batch / Recall). Read-only.
export async function GET(request: Request) {
  const session = await requirePermission("kitchen:read");
  if (session.response) {
    return session.response;
  }
  const date = new URL(request.url).searchParams.get("date");
  if (date && !/^d{4}-d{2}-d{2}$/.test(date)) {
    return fail(400, "INVALID_DATE", "Tanggal tidak valid.");
  }
  return ok(await getProductionBatchHistory(session.data, { date }));
}

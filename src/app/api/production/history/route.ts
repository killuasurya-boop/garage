import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { getProductionHistory } from "@/lib/production-hub-history";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().max(40).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(["all", "active", "ready", "delivered", "cancelled"]).optional(),
});

// Riwayat produksi per order (Production Hub V4, drawer Riwayat): cari no. order
// / meja / nama, filter tanggal & status, jejak waktu, dan riwayat cetak SELESAI.
export async function GET(request: Request) {
  const session = await requirePermission("kitchen:read");
  if (session.response) {
    return session.response;
  }
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") || undefined,
    date: url.searchParams.get("date") || undefined,
    status: url.searchParams.get("status") || undefined,
  });
  if (!parsed.success) {
    return fail(400, "INVALID_QUERY", "Filter riwayat tidak valid.");
  }
  return ok(await getProductionHistory(session.data, parsed.data));
}

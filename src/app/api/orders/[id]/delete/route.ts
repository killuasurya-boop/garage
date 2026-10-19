import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { deleteUnpaidInvoice } from "@/lib/garage-service";
import { checkIdempotency } from "@/lib/idempotency";
import { rateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

type DeleteResult = Awaited<ReturnType<typeof deleteUnpaidInvoice>>;

// Hapus invoice belum lunas — Owner/Manajer saja, wajib alasan + ketik nomor invoice.
const deleteSchema = z.object({
  reason: z.string().trim().min(5, "Alasan minimal 5 karakter.").max(200),
  confirmOrderNo: z.string().trim().min(3).max(40),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "order-delete", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const session = await requirePermission("finance:write");
  if (session.response) return session.response;
  if (session.data.profile.role !== "Owner" && session.data.profile.role !== "Manajer") {
    return fail(403, "FORBIDDEN", "Hanya Owner atau Manajer yang boleh menghapus invoice.");
  }

  const body = await readJson(request, deleteSchema);
  if (body.error) return body.error;

  const { id } = await context.params;
  const cache = checkIdempotency<DeleteResult>(`order-delete:${session.data.user.id}`, id);
  if (cache.kind === "hit") return ok(cache.result);
  if (cache.kind === "pending") return fail(409, "ORDER_DELETE_IN_PROGRESS", "Hapus invoice masih diproses.");

  try {
    const result = await deleteUnpaidInvoice(id, body.data, session.data);
    cache.commit(result);
    return ok(result);
  } catch (error) {
    cache.abandon();
    return fail(400, "ORDER_DELETE_FAILED", error instanceof Error ? error.message : "Gagal menghapus invoice.");
  }
}

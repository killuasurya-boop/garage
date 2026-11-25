import { z } from "zod";

import { fail, ok, readJson, serviceErrorResponse } from "@/lib/api-response";
import { confirmOrderPayment } from "@/lib/garage-service";
import { checkIdempotency } from "@/lib/idempotency";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

// Konfirmasi lunas (Pending → Lunas) — Owner/Manajer, wajib shift open, alur Final Bayar.
const schema = z.object({
  paymentMethod: z.enum(["Cash", "QRIS", "Bank Transfer", "E-Wallet"]),
  cashReceived: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
  reason: z.string().trim().min(3, "Alasan minimal 3 karakter.").max(200),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;
  const cache = checkIdempotency<Awaited<ReturnType<typeof confirmOrderPayment>>>(`order-confirm:${session.data.user.id}`, id);
  if (cache.kind === "hit") return ok(cache.result);
  if (cache.kind === "pending") return fail(409, "IN_PROGRESS", "Masih diproses.");
  try {
    const result = await confirmOrderPayment(id, body.data, session.data);
    // Hasil TIDAK disimpan (S10): kunci cache = id order, jadi konfirmasi → batal → konfirmasi
    // dalam 60 dtk dulu mengembalikan hasil lama tanpa menyimpan apa pun. Kunci hanya menahan
    // kiriman ganda yang masih berjalan; ulangan setelah selesai ditolak service (status sudah berubah).
    cache.abandon();
    return ok(result);
  } catch (error) {
    cache.abandon();
    return serviceErrorResponse(error, "PAYMENT_CONFIRM_FAILED", "Gagal mengonfirmasi pelunasan.");
  }
}

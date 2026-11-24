import { z } from "zod";

import { readIdempotencyKey } from "@/lib/idempotency";
import { SYNC_KEY_CONFLICT_ERROR, syncPosTransaction } from "@/lib/member-service";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";
import { requirePosTerminal } from "@/lib/pos-api-key";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Batas wajar satu struk terminal (Rp 50 juta). Di atasnya hampir pasti salah ketik / penyalahgunaan. */
const POS_SYNC_MAX_AMOUNT = 50_000_000;

const syncSchema = z.object({
  terminalCode: z.string().trim().min(2, "terminalCode wajib diisi."),
  memberPhone: z.string().trim().min(8, "memberPhone wajib valid."),
  totalAmount: z
    .number()
    .int()
    .positive("totalAmount wajib lebih dari 0.")
    .max(POS_SYNC_MAX_AMOUNT, "totalAmount melebihi batas satu transaksi (Rp 50.000.000)."),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "pos-sync-transaction", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  // Audit #17: kunci terminal diverifikasi SEBELUM body dibaca (tanpa kunci = 401, bukan 400 validasi).
  const keyCheck = await requirePosTerminal(request);
  if (keyCheck.response) return keyCheck.response;

  // Audit POS Nov 2026: kunci anti-dobel WAJIB. Tanpa kunci, kirim ulang (WiFi putus/timeout)
  // menambah poin dua kali. Kunci disimpan di DB (member_transactions.request_key), jadi tetap
  // berlaku setelah server restart atau di instance lain.
  const key = readIdempotencyKey(request);
  if (!key) {
    return errorJson(400, "Header X-Idempotency-Key wajib diisi (8–128 karakter, satu per struk).");
  }

  const body = await readMemberJson(request, syncSchema);
  if (body.response) return body.response;

  // Kode terminal di body harus milik kunci yang dipakai.
  const terminal = await requirePosTerminal(request, body.data.terminalCode);
  if (terminal.response) return terminal.response;

  const result = await syncPosTransaction({
    memberPhone: body.data.memberPhone,
    totalAmount: body.data.totalAmount,
    requestKey: `pos-sync:${body.data.terminalCode}:${key}`,
  });

  if (!result.data) {
    if (result.error === SYNC_KEY_CONFLICT_ERROR) return errorJson(409, result.error);
    return errorJson(404, result.error ?? "Member tidak ditemukan.");
  }

  return successJson(result.data);
}

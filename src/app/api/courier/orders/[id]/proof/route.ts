import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { fail, ok } from "@/lib/api-response";
import { CourierError, assertCanAttachDeliveryProof, attachDeliveryProof } from "@/lib/garage-courier";
import { deliveryProofDir, detectProofImage } from "@/lib/delivery-proof-storage";
import { rateLimit } from "@/lib/rate-limit";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const MAX_BYTES = 6 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Foto bukti terkirim (wajib sebelum "Sudah sampai").
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "courier-proof", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requireGarageSession();
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return fail(400, "INVALID_ORDER_ID", "Order tidak valid.");

  // Cek kepemilikan dulu — akun lain tidak boleh mengisi disk dengan file yatim.
  try {
    await assertCanAttachDeliveryProof(id, session.data);
  } catch (error) {
    if (error instanceof CourierError) return fail(error.status, "COURIER_PROOF_FAILED", error.message);
    throw error;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(400, "INVALID_MULTIPART", "Kirim foto sebagai multipart/form-data (field file).");
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) return fail(400, "FILE_MISSING", "Foto bukti wajib diambil.");
  if (file.size > MAX_BYTES) return fail(413, "FILE_TOO_LARGE", "Foto terlalu besar (maks 6 MB).");
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = detectProofImage(buffer);
  if (!ext) return fail(400, "FILE_UNSUPPORTED", "Foto harus JPG, PNG, atau WEBP.");

  const fileName = `proof-${id.toLowerCase()}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
  try {
    const dir = deliveryProofDir();
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, fileName), buffer);
  } catch (error) {
    console.error("Failed to save delivery proof", error);
    return fail(500, "FILE_SAVE_FAILED", "Foto gagal disimpan. Coba lagi.");
  }
  try {
    return ok(await attachDeliveryProof(id, `/api/courier/proof/${fileName}`, session.data), { status: 201 });
  } catch (error) {
    await unlink(path.join(deliveryProofDir(), fileName)).catch(() => null);
    if (error instanceof CourierError) return fail(error.status, "COURIER_PROOF_FAILED", error.message);
    return fail(500, "COURIER_PROOF_FAILED", "Foto bukti gagal dicatat.");
  }
}

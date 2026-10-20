import { fail, ok } from "@/lib/api-response";
import {
  CASH_RECEIPT_MAX_INPUT_BYTES,
  isAcceptedReceiptImage,
  readCashReceipt,
  storeCashReceipt,
} from "@/lib/cash-receipt-storage";
import { cashMovementErrorResponse } from "@/lib/cash-movement-http";
import {
  getCashMovementDetail,
  getCashMovementReceiptPhoto,
  setCashMovementReceiptPhoto,
} from "@/lib/garage-service";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Lihat foto nota (pencatat atau Owner/Manajer). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const { id } = await context.params;
  const relative = await getCashMovementReceiptPhoto(id, session.data);
  const data = relative ? await readCashReceipt(relative) : null;
  if (!data) return fail(404, "RECEIPT_NOT_FOUND", "Foto nota tidak ditemukan.");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Lampirkan / ganti foto nota (multipart, field `image`). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const { id } = await context.params;

  // Cek akses dulu supaya permintaan tanpa hak tidak menulis file ke disk.
  const detail = await getCashMovementDetail(id, session.data);
  if (!detail) return fail(404, "NOT_FOUND", "Transaksi kas tidak ditemukan.");
  if (!detail.canManage && detail.movement.createdById !== session.data.user.id) {
    return fail(403, "FORBIDDEN", "Hanya pencatat transaksi atau Owner/Manajer yang bisa melampirkan bukti.");
  }
  if (detail.movement.status === "rejected" || detail.movement.status === "voided") {
    return fail(409, "NOT_ACTIVE", "Transaksi ditolak/dibatalkan tidak bisa diberi bukti.");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(400, "INVALID_MULTIPART_FORM", "Kirim foto sebagai multipart/form-data (field image).");
  }
  const image = formData.get("image");
  if (!(image instanceof File) || image.size <= 0) return fail(400, "RECEIPT_MISSING", "Foto nota wajib dipilih.");
  if (image.size > CASH_RECEIPT_MAX_INPUT_BYTES) return fail(413, "RECEIPT_TOO_LARGE", "Ukuran foto maksimal 8 MB.");
  if (!isAcceptedReceiptImage(image)) {
    return fail(400, "RECEIPT_UNSUPPORTED", "Format belum didukung. Gunakan foto JPG, PNG, atau WebP.");
  }

  let relative: string;
  try {
    relative = await storeCashReceipt(detail.movement.id, Buffer.from(await image.arrayBuffer()));
  } catch (error) {
    return fail(400, "RECEIPT_INVALID", error instanceof Error ? error.message : "Foto tidak bisa diproses.");
  }
  try {
    await setCashMovementReceiptPhoto(detail.movement.id, relative, session.data);
    return ok({ hasReceiptPhoto: true }, { status: 201 });
  } catch (error) {
    const response = cashMovementErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

import { fail, ok } from "@/lib/api-response";
import { CASH_RECEIPT_MAX_INPUT_BYTES, isAcceptedReceiptImage, readCashReceipt, storeCashReceipt } from "@/lib/cash-receipt-storage";
import { SponsorError, sponsorPaymentProofPath, setSponsorPaymentProof } from "@/lib/event-sponsor-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const toFail = (error: unknown) =>
  error instanceof SponsorError ? fail(error.status, error.code, error.message) : fail(400, "PROOF_FAILED", error instanceof Error ? error.message : "Gagal memproses bukti.");

/** Foto bukti transfer sponsor (Owner). Disimpan di storage non-publik yang sama dengan nota kas. */
export async function GET(_request: Request, context: { params: Promise<{ paymentId: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { paymentId } = await context.params;
  try {
    const row = await sponsorPaymentProofPath(paymentId, session.data);
    const data = row.proofPath ? await readCashReceipt(row.proofPath) : null;
    if (!data) return fail(404, "PROOF_NOT_FOUND", "Bukti belum diunggah.");
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return toFail(error);
  }
}

/** Unggah / ganti foto bukti (multipart, field `image`). */
export async function POST(request: Request, context: { params: Promise<{ paymentId: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { paymentId } = await context.params;
  try {
    // Cek akses & keberadaan data dulu supaya permintaan tanpa hak tidak menulis file.
    const row = await sponsorPaymentProofPath(paymentId, session.data);
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return fail(400, "INVALID_MULTIPART_FORM", "Kirim foto sebagai multipart/form-data (field image).");
    }
    const image = formData.get("image");
    if (!(image instanceof File) || image.size <= 0) return fail(400, "PROOF_MISSING", "Foto bukti wajib dipilih.");
    if (image.size > CASH_RECEIPT_MAX_INPUT_BYTES) return fail(413, "PROOF_TOO_LARGE", "Ukuran foto maksimal 8 MB.");
    if (!isAcceptedReceiptImage(image)) return fail(400, "PROOF_UNSUPPORTED", "Format belum didukung. Gunakan foto JPG, PNG, atau WebP.");
    const relative = await storeCashReceipt(row.id, Buffer.from(await image.arrayBuffer()));
    return ok(await setSponsorPaymentProof(paymentId, relative, session.data), { status: 201 });
  } catch (error) {
    return toFail(error);
  }
}

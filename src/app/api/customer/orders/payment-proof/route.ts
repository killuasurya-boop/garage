import { fail, ok } from "@/lib/api-response";
import { attachPaymentProof } from "@/lib/payment-proof";
import { ProfileFileError } from "@/lib/profile-file-storage";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publik (menu digital): unggah bukti transfer/QRIS. Bukti kepemilikan = token invoice.
export async function POST(request: Request) {
  const limited = rateLimit(request, "customer-payment-proof", { limit: 8, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const form = await request.formData().catch(() => null);
  if (!form) return fail(400, "INVALID_MULTIPART", "Kirim bukti sebagai multipart/form-data (field file & token).");
  try {
    return ok(await attachPaymentProof(String(form.get("token") ?? ""), form.get("file")), { status: 201 });
  } catch (error) {
    if (error instanceof ProfileFileError) return fail(error.status, error.code, error.message);
    console.error("Payment proof upload failed", error);
    return fail(500, "PAYMENT_PROOF_FAILED", "Bukti gagal diunggah. Coba lagi.");
  }
}

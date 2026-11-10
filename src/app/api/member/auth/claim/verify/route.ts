import { z } from "zod";

import { MemberOtpError, claimWithCashierCode } from "@/lib/member-otp";
import { memberWhatsappSchema } from "@/lib/member-phone";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  phone: memberWhatsappSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Kode harus 6 angka."),
});

// Kode klaim dari kasir (owner Nov 2026): pelanggan memasukkan nomor + kode 6 angka yang dibuat kasir di POS.
// Benar → token sekali pakai yang sama dengan OTP WhatsApp untuk /api/member/auth/register.
// Batas: 10/menit per IP + 5 percobaan per kode (kode berlaku 15 menit, satu kode aktif per nomor).
export async function POST(request: Request) {
  const limited = rateLimit(request, "member-claim-verify", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const body = await readMemberJson(request, schema);
  if (body.response) return body.response;
  try {
    const result = await claimWithCashierCode(body.data);
    return successJson({ verificationToken: result.verificationToken, tokenExpiresAt: result.tokenExpiresAt });
  } catch (error) {
    if (error instanceof MemberOtpError) return errorJson(error.status, error.message);
    throw error;
  }
}

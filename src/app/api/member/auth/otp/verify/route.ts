import { z } from "zod";

import { MemberOtpError, checkMemberOtpCode } from "@/lib/member-otp";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  challengeId: z.string().uuid("Kode tidak valid."),
  code: z.string().trim().regex(/^\d{6}$/, "Kode harus 6 angka."),
});

// Cek kode OTP (maks. 5 percobaan per kode). Benar → token sekali pakai untuk daftar.
export async function POST(request: Request) {
  const limited = rateLimit(request, "member-otp-verify", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const body = await readMemberJson(request, schema);
  if (body.response) return body.response;
  try {
    const result = await checkMemberOtpCode(body.data);
    return successJson({ verificationToken: result.verificationToken, tokenExpiresAt: result.tokenExpiresAt });
  } catch (error) {
    if (error instanceof MemberOtpError) return errorJson(error.status, error.message);
    throw error;
  }
}

import { z } from "zod";

import { MemberOtpError, requestMemberOtp } from "@/lib/member-otp";
import { memberWhatsappSchema } from "@/lib/member-phone";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({ phone: memberWhatsappSchema, purpose: z.enum(["register"]).default("register") });

// Kirim kode OTP ke WhatsApp pendaftar. Batas per IP di sini; per nomor (jeda 60 dtk,
// 3/15 menit, 8/hari) di member-otp-rules.ts.
export async function POST(request: Request) {
  const limited = rateLimit(request, "member-otp-request", { limit: 5, windowMs: 60_000 });
  if (limited) return limited;
  const body = await readMemberJson(request, schema);
  if (body.response) return body.response;
  try {
    return successJson(await requestMemberOtp({ phone: body.data.phone, purpose: body.data.purpose }));
  } catch (error) {
    if (error instanceof MemberOtpError) return errorJson(error.status, error.message);
    throw error;
  }
}

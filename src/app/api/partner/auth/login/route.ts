import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { fail } from "@/lib/api-response";
import { authenticatePartner, partnerSessionCookie, signPartnerSession } from "@/lib/partner-auth";
import { normalizePhone } from "@/lib/member-types";
import { checkPinAttempt, recordPinFailure, resetPinAttempts } from "@/lib/pin-attempt-guard";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  phone: z.string().trim().min(9).max(20),
  pin: z.string().regex(/^\d{6}$/, "PIN harus 6 angka."),
});

// Login Portal Mitra: nomor HP + PIN. Batas per IP + kunci per akun di DB (tahan restart).
export async function POST(request: Request) {
  const limited = rateLimit(request, "partner-login", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const phone = normalizePhone(body.data.phone);
  const key = `partner-login:${phone}`;
  const attempt = await checkPinAttempt(key);
  if (!attempt.allowed) return fail(429, "PIN_LOCKED", `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil((attempt.retryAfterSec ?? 60) / 60)} menit.`);
  const result = await authenticatePartner(phone, body.data.pin);
  if (!result) {
    await recordPinFailure(key);
    return fail(401, "INVALID_LOGIN", "Nomor HP atau PIN salah.");
  }
  if (!result.ok) return fail(403, "PARTNER_INACTIVE", result.blocked);
  await resetPinAttempts(key);
  const token = signPartnerSession(result.account);
  const response = Response.json({ data: { partner: { name: result.partner.name, code: result.partner.code }, account: { displayName: result.account.displayName } } });
  response.headers.append("Set-Cookie", partnerSessionCookie(token, request));
  return response;
}

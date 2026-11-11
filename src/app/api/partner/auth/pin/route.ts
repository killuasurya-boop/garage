import { z } from "zod";

import { fail, readJson } from "@/lib/api-response";
import { changePartnerPin, partnerSessionCookie, requirePartnerSession, signPartnerSession } from "@/lib/partner-auth";
import { checkPinAttempt, recordPinFailure, resetPinAttempts } from "@/lib/pin-attempt-guard";

export const runtime = "nodejs";

const schema = z.object({
  oldPin: z.string().regex(/^\d{6}$/, "PIN lama harus 6 angka."),
  newPin: z.string().regex(/^\d{6}$/, "PIN baru harus 6 angka."),
});

// Mitra mengganti PIN sendiri (PIN lama wajib). Perangkat lain otomatis keluar; perangkat ini dapat sesi baru.
export async function POST(request: Request) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const key = `partner-pin-change:${session.data.account.id}`;
  const attempt = await checkPinAttempt(key);
  if (!attempt.allowed) return fail(429, "PIN_LOCKED", `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil((attempt.retryAfterSec ?? 60) / 60)} menit.`);
  const result = await changePartnerPin(session.data.account.id, body.data.oldPin, body.data.newPin);
  if (!result.ok) {
    if (result.code === "WRONG_PIN") await recordPinFailure(key);
    return fail(result.code === "WRONG_PIN" ? 401 : 400, result.code, result.message);
  }
  await resetPinAttempts(key);
  const response = Response.json({ data: { changed: true } });
  response.headers.append("Set-Cookie", partnerSessionCookie(signPartnerSession(result.account), request));
  return response;
}

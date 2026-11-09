import { z } from "zod";

import { createMemberTokenPair, memberCookieHeaders, parseCookies } from "@/lib/member-auth";
import { clearOauthCookie, GOOGLE_PENDING_COOKIE, openPendingProfile, randomUnusablePassword } from "@/lib/member-google-oauth";
import { memberWhatsappSchema } from "@/lib/member-phone";
import { completeGoogleMember } from "@/lib/member-service";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";
import { guardLockedFor, guardRecordFail, guardReset, lockedMessage, MEMBER_LOGIN_POLICY } from "@/lib/pin-guard";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const completeSchema = z.object({
  name: z.string().trim().min(2, "Nama wajib diisi.").max(80),
  phone: memberWhatsappSchema,
  acceptTerms: z.literal(true, { message: "Setujui Syarat & Ketentuan membership." }),
  marketingConsent: z.boolean().default(false),
  /** PIN akun lama bila nomor HP sudah terdaftar (tautkan Google ke akun itu). */
  existingPin: z.string().min(6).max(72).optional(),
});

// Aktivasi member baru dari Google: email diambil dari ID token terverifikasi (cookie), bukan dari body.
export async function POST(request: Request) {
  const limited = rateLimit(request, "member-google-complete", { limit: 8, windowMs: 60_000 });
  if (limited) return limited;
  const pending = openPendingProfile(parseCookies(request)[GOOGLE_PENDING_COOKIE]);
  if (!pending) return errorJson(401, "Sesi Google sudah habis. Ulangi Lanjutkan dengan Google.");
  const body = await readMemberJson(request, completeSchema);
  if (body.response) return body.response;

  // Kunci per nomor HP untuk tebakan PIN akun lama (sama dengan login PIN).
  const guardKey = `member-login:${body.data.phone.replace(/[^0-9]/g, "")}`;
  const lockedFor = guardLockedFor(guardKey);
  if (body.data.existingPin && lockedFor) return errorJson(429, lockedMessage(lockedFor));

  const result = await completeGoogleMember({
    identity: { sub: pending.sub, email: pending.email, emailVerified: true, name: pending.name, picture: pending.picture },
    name: body.data.name,
    phone: body.data.phone,
    acceptTerms: body.data.acceptTerms,
    marketingConsent: body.data.marketingConsent,
    randomPassword: randomUnusablePassword(),
    existingPin: body.data.existingPin ?? null,
  });
  if (!result.data) {
    if (result.code === "PIN_WRONG") guardRecordFail(guardKey, MEMBER_LOGIN_POLICY);
    // Kode dikirim agar form menampilkan kolom PIN akun lama (PHONE_NEEDS_PIN) tanpa menebak dari teks.
    return Response.json({ success: false, message: result.error, code: result.code ?? "COMPLETE_FAILED" }, { status: result.code === "PIN_WRONG" ? 403 : 409 });
  }
  if (body.data.existingPin) guardReset(guardKey);

  const tokens = await createMemberTokenPair(result.data.account.id, request);
  const headers = new Headers();
  for (const cookie of memberCookieHeaders(tokens.accessToken, tokens.refreshToken, tokens.refreshExpiresAt, request)) {
    headers.append("Set-Cookie", cookie);
  }
  headers.append("Set-Cookie", clearOauthCookie(GOOGLE_PENDING_COOKIE));
  return successJson({ member: result.data.member, next: pending.next }, { headers, status: 201 });
}

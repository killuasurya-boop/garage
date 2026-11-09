import { z } from "zod";

import { createMemberTokenPair, memberCookieHeaders, parseCookies } from "@/lib/member-auth";
import { clearOauthCookie, GOOGLE_PENDING_COOKIE, openPendingProfile, randomUnusablePassword } from "@/lib/member-google-oauth";
import { memberWhatsappSchema } from "@/lib/member-phone";
import { completeGoogleMember } from "@/lib/member-service";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const completeSchema = z.object({
  name: z.string().trim().min(2, "Nama wajib diisi.").max(80),
  phone: memberWhatsappSchema,
  acceptTerms: z.literal(true, { message: "Setujui Syarat & Ketentuan membership." }),
  marketingConsent: z.boolean().default(false),
});

// Aktivasi member baru dari Google: email diambil dari ID token terverifikasi (cookie), bukan dari body.
export async function POST(request: Request) {
  const limited = rateLimit(request, "member-google-complete", { limit: 8, windowMs: 60_000 });
  if (limited) return limited;
  const pending = openPendingProfile(parseCookies(request)[GOOGLE_PENDING_COOKIE]);
  if (!pending) return errorJson(401, "Sesi Google sudah habis. Ulangi Lanjutkan dengan Google.");
  const body = await readMemberJson(request, completeSchema);
  if (body.response) return body.response;

  const result = await completeGoogleMember({
    identity: { sub: pending.sub, email: pending.email, emailVerified: true, name: pending.name, picture: pending.picture },
    name: body.data.name,
    phone: body.data.phone,
    acceptTerms: body.data.acceptTerms,
    marketingConsent: body.data.marketingConsent,
    randomPassword: randomUnusablePassword(),
  });
  if (!result.data) return errorJson(409, result.error ?? "Aktivasi member gagal.");

  const tokens = await createMemberTokenPair(result.data.account.id, request);
  const headers = new Headers();
  for (const cookie of memberCookieHeaders(tokens.accessToken, tokens.refreshToken, tokens.refreshExpiresAt, request)) {
    headers.append("Set-Cookie", cookie);
  }
  headers.append("Set-Cookie", clearOauthCookie(GOOGLE_PENDING_COOKIE));
  return successJson({ member: result.data.member, next: pending.next }, { headers, status: 201 });
}

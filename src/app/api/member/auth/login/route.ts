import { z } from "zod";

import { createMemberTokenPair, memberCookieHeaders } from "@/lib/member-auth";
import { loginMember } from "@/lib/member-service";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";
import { guardLockedFor, guardRecordFail, guardReset, lockedMessage, MEMBER_LOGIN_POLICY } from "@/lib/pin-guard";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Email atau nomor HP wajib diisi."),
  password: z.string().min(6, "Password/PIN minimal 6 karakter."),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "member-auth-login", { limit: 12, windowMs: 60_000 });
  if (limited) return limited;

  const body = await readMemberJson(request, loginSchema);
  if (body.response) return body.response;

  // Kunci per akun (nomor HP/email), bukan per IP — header IP bisa dipalsukan.
  const guardKey = `member-login:${body.data.identifier.toLowerCase().replace(/[^a-z0-9@.]/g, "")}`;
  const lockedFor = guardLockedFor(guardKey);
  if (lockedFor) return errorJson(429, lockedMessage(lockedFor));

  const result = await loginMember(body.data);
  if (!result.data) {
    guardRecordFail(guardKey, MEMBER_LOGIN_POLICY);
    return errorJson(401, result.error ?? "Login member gagal.");
  }
  guardReset(guardKey);

  const tokenPair = await createMemberTokenPair(result.data.account.id, request);
  const headers = new Headers();
  for (const cookie of memberCookieHeaders(
    tokenPair.accessToken,
    tokenPair.refreshToken,
    tokenPair.refreshExpiresAt,
    request,
  )) {
    headers.append("Set-Cookie", cookie);
  }

  return successJson({ member: result.data.member }, { headers });
}

import { z } from "zod";

import { createMemberTokenPair, memberCookieHeaders } from "@/lib/member-auth";
import { loginMember } from "@/lib/member-service";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";
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

  const result = await loginMember(body.data);
  if (!result.data) {
    return errorJson(401, result.error ?? "Login member gagal.");
  }

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

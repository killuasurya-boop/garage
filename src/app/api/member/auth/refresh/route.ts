import {
  memberCookieHeaders,
  readRefreshToken,
  rotateMemberTokenPair,
} from "@/lib/member-auth";
import { errorJson, successJson } from "@/lib/member-types";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(request, "member-auth-refresh", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const refreshToken = readRefreshToken(request);
  if (!refreshToken) {
    return errorJson(401, "Refresh token member tidak ditemukan.");
  }

  const tokenPair = await rotateMemberTokenPair(refreshToken, request);
  if (!tokenPair) {
    return errorJson(401, "Refresh token member tidak valid atau sudah kedaluwarsa.");
  }

  const headers = new Headers();
  for (const cookie of memberCookieHeaders(
    tokenPair.accessToken,
    tokenPair.refreshToken,
    tokenPair.refreshExpiresAt,
    request,
  )) {
    headers.append("Set-Cookie", cookie);
  }

  return successJson({ refreshed: true }, { headers });
}

import { secureCookieAttribute } from "@/lib/member-auth";
import { buildGoogleAuthorization, GOOGLE_STATE_COOKIE, googleConfig, oauthCookie } from "@/lib/member-google-oauth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mulai login Google: state + nonce + PKCE disimpan di cookie bertanda tangan, lalu redirect ke Google.
export async function GET(request: Request) {
  const limited = rateLimit(request, "member-google-start", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const url = new URL(request.url);
  const config = googleConfig();
  if (!config) {
    return Response.redirect(new URL(`/member-login?error=google_unavailable`, url.origin), 302);
  }
  const auth = buildGoogleAuthorization(config, url.searchParams.get("next") ?? "/member");
  const headers = new Headers({ Location: auth.url, "Cache-Control": "no-store" });
  headers.append("Set-Cookie", oauthCookie(GOOGLE_STATE_COOKIE, auth.cookie, auth.maxAge, secureCookieAttribute(request), "/api/member/auth/google"));
  return new Response(null, { status: 302, headers });
}

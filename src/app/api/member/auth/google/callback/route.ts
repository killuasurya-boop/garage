import { createMemberTokenPair, memberCookieHeaders, parseCookies, secureCookieAttribute } from "@/lib/member-auth";
import {
  clearOauthCookie,
  exchangeGoogleCode,
  GOOGLE_PENDING_COOKIE,
  GOOGLE_STATE_COOKIE,
  googleConfig,
  GoogleAuthError,
  oauthCookie,
  readGoogleState,
  sealPendingProfile,
} from "@/lib/member-google-oauth";
import { signInMemberWithGoogle } from "@/lib/member-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirect(origin: string, path: string, cookies: string[]) {
  const headers = new Headers({ Location: new URL(path, origin).toString(), "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

// Kembali dari Google: cek state, tukar kode (PKCE), verifikasi ID token, lalu login / tautkan / lengkapi profil.
export async function GET(request: Request) {
  const limited = rateLimit(request, "member-google-callback", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const url = new URL(request.url);
  const clearState = clearOauthCookie(GOOGLE_STATE_COOKIE, "/api/member/auth/google");
  const config = googleConfig();
  const state = readGoogleState(parseCookies(request)[GOOGLE_STATE_COOKIE], url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!config) return redirect(url.origin, "/member-login?error=google_unavailable", [clearState]);
  if (!state || !code || url.searchParams.get("error")) {
    return redirect(url.origin, "/member-login?error=google_cancelled", [clearState]);
  }
  try {
    const identity = await exchangeGoogleCode(config, { code, verifier: state.verifier, nonce: state.nonce });
    const result = await signInMemberWithGoogle(identity);
    if (result.kind === "error") {
      return redirect(url.origin, `/member-login?error=google_rejected&message=${encodeURIComponent(result.error)}`, [clearState]);
    }
    if (result.kind === "needs_profile") {
      const pending = sealPendingProfile({ ...identity, next: state.next });
      return redirect(url.origin, `/member-login?mode=google-complete&next=${encodeURIComponent(state.next)}`, [
        clearState,
        oauthCookie(GOOGLE_PENDING_COOKIE, pending.value, pending.maxAge, secureCookieAttribute(request)),
      ]);
    }
    const tokens = await createMemberTokenPair(result.account.id, request);
    return redirect(url.origin, state.next, [
      clearState,
      ...memberCookieHeaders(tokens.accessToken, tokens.refreshToken, tokens.refreshExpiresAt, request),
    ]);
  } catch (error) {
    const code = error instanceof GoogleAuthError ? error.code : "UNKNOWN";
    console.warn(`[member-google] callback gagal: ${code}`);
    return redirect(url.origin, "/member-login?error=google_failed", [clearState]);
  }
}

// Lanjutkan alur OAuth (MCP ChatGPT) dari halaman login Garage yang memakai
// fetch biasa. Plugin OAuth mengirim pengguna ke /login dengan query bertanda
// tangan (`sig`); query itu harus ikut di body sign-in sebagai `oauth_query`.
// Logika sama dengan buildSignedOAuthQuery milik @better-auth/oauth-provider
// (tes membandingkan keduanya). Tanpa `sig` → undefined → login biasa.

const SIGNED_PARAM_NAMES = "ba_param";

export function signedOAuthQuery(search: string): string | undefined {
  const params = new URLSearchParams(search);
  if (!params.has("sig")) return undefined;
  const signedNames = new Set(params.getAll(SIGNED_PARAM_NAMES));
  if (!signedNames.size) return undefined;
  const signed = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (key === "sig" || key === SIGNED_PARAM_NAMES || signedNames.has(key)) signed.append(key, value);
  }
  return signed.toString();
}

/** URL lanjutan OAuth dari respons sign-in/2FA (`{ redirect: true, url }`). */
export function oauthContinueUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const { redirect, url } = data as { redirect?: unknown; url?: unknown };
  return redirect === true && typeof url === "string" && url ? url : null;
}

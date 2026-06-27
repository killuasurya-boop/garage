import { fail } from "@/lib/api-response";
import {
  saveTikTokOAuthConnection,
  verifyTikTokOAuthState,
} from "@/lib/garage-tiktok-publisher";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

function redirectStatus(origin: string, returnTo: string, status: string) {
  const url = new URL(returnTo, origin);
  url.searchParams.set("tiktok", status);
  return Response.redirect(url, 302);
}

export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) return session.response;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return redirectStatus(url.origin, "/", "denied");
  if (!code || !state) {
    return fail(400, "TIKTOK_OAUTH_INVALID_CALLBACK", "Callback TikTok tidak lengkap.");
  }

  let verified: ReturnType<typeof verifyTikTokOAuthState>;
  try {
    verified = verifyTikTokOAuthState(state);
  } catch (error) {
    return fail(
      400,
      "TIKTOK_OAUTH_INVALID_STATE",
      error instanceof Error ? error.message : "State TikTok tidak valid.",
    );
  }
  if (verified.userId !== session.data.user.id) {
    return fail(403, "TIKTOK_OAUTH_USER_MISMATCH", "Session Owner tidak sesuai.");
  }

  try {
    await saveTikTokOAuthConnection({ code, userId: session.data.user.id });
    return redirectStatus(url.origin, verified.returnTo, "connected");
  } catch {
    return redirectStatus(url.origin, verified.returnTo, "error");
  }
}

import { fail } from "@/lib/api-response";
import {
  buildTikTokAuthorizationUrl,
  tiktokClientConfigured,
} from "@/lib/garage-tiktok-publisher";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) return session.response;
  if (!tiktokClientConfigured()) {
    return fail(
      503,
      "TIKTOK_OAUTH_MISSING",
      "TIKTOK_CLIENT_KEY dan TIKTOK_CLIENT_SECRET belum dikonfigurasi.",
    );
  }

  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") || "/";
  return Response.redirect(
    buildTikTokAuthorizationUrl({
      userId: session.data.user.id,
      returnTo,
    }),
    302,
  );
}

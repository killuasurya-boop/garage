import { fail } from "@/lib/api-response";
import {
  buildGoogleDriveAuthorizeUrl,
  googleOAuthClientConfigured,
  signGoogleDriveState,
} from "@/lib/google-drive-upload";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  if (!googleOAuthClientConfigured()) {
    return fail(
      503,
      "GOOGLE_DRIVE_OAUTH_MISSING",
      "GOOGLE_OAUTH_CLIENT_ID dan GOOGLE_OAUTH_CLIENT_SECRET belum dikonfigurasi.",
    );
  }

  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/";
  const state = signGoogleDriveState({
    userId: session.data.user.id,
    returnTo,
  });
  const authorizeUrl = buildGoogleDriveAuthorizeUrl({
    origin: url.origin,
    state,
  });

  return Response.redirect(authorizeUrl, 302);
}

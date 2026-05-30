import { fail } from "@/lib/api-response";
import {
  saveGoogleDriveOAuthConnection,
  verifyGoogleDriveState,
} from "@/lib/google-drive-upload";
import { createAuditLog } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

function redirectWithStatus(origin: string, returnTo: string, status: string) {
  const url = new URL(returnTo, origin);
  url.searchParams.set("garageDrive", status);
  return Response.redirect(url, 302);
}

export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");

  if (googleError) {
    return redirectWithStatus(url.origin, "/", "denied");
  }

  if (!code || !state) {
    return fail(
      400,
      "GOOGLE_DRIVE_OAUTH_INVALID_CALLBACK",
      "Callback Google Drive tidak lengkap.",
    );
  }

  let verified: ReturnType<typeof verifyGoogleDriveState>;
  try {
    verified = verifyGoogleDriveState(state);
  } catch (error) {
    return fail(
      400,
      "GOOGLE_DRIVE_OAUTH_INVALID_STATE",
      error instanceof Error ? error.message : "State Google Drive tidak valid.",
    );
  }

  if (verified.userId !== session.data.user.id) {
    return fail(
      403,
      "GOOGLE_DRIVE_OAUTH_USER_MISMATCH",
      "Session POS tidak sama dengan Owner yang memulai login Google Drive.",
    );
  }

  try {
    await saveGoogleDriveOAuthConnection({
      userId: session.data.user.id,
      code,
      origin: url.origin,
    });

    void createAuditLog({
      actor: session.data.user.name ?? session.data.user.email,
      action: "Google Drive OAuth connected",
      object: "GARAGE AI reports",
      device: session.data.profile.deviceLabel,
      status: "ready",
      metadata: {
        authMode: "google_oauth",
      },
    }).catch(() => undefined);

    return redirectWithStatus(url.origin, verified.returnTo, "connected");
  } catch (error) {
    void createAuditLog({
      actor: session.data.user.name ?? session.data.user.email,
      action: "Google Drive OAuth failed",
      object: "GARAGE AI reports",
      device: session.data.profile.deviceLabel,
      status: "error",
      metadata: {
        error: error instanceof Error ? error.message : "OAuth Google Drive gagal.",
      },
    }).catch(() => undefined);

    const redirectUrl = new URL(verified.returnTo, url.origin);
    redirectUrl.searchParams.set("garageDrive", "error");
    return Response.redirect(redirectUrl, 302);
  }
}

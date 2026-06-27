import { fail } from "@/lib/api-response";
import {
  saveGoogleOAuthConnection,
  verifyGoogleOAuthState,
} from "@/lib/garage-google-integrations";
import { requireGarageSession } from "@/lib/server-auth";
import {
  saveThreadsOAuthConnection,
  verifyThreadsOAuthState,
} from "@/lib/garage-threads-publisher";
import { auditSafely } from "@/lib/garage-social-audit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) return session.response;
  const { provider } = await context.params;
  if (provider !== "youtube" && provider !== "google_business" && provider !== "threads") {
    return fail(404, "OAUTH_CALLBACK_UNKNOWN", "Callback OAuth provider tidak dikenal.");
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail(400, "OAUTH_CALLBACK_INVALID", "Code atau state tidak tersedia.");

  try {
    const verified =
      provider === "threads" ? verifyThreadsOAuthState(state) : verifyGoogleOAuthState(state);
    if (verified.userId !== session.data.user.id) {
      return fail(403, "OAUTH_USER_MISMATCH", "Session Owner tidak sesuai.");
    }
    if (provider === "threads") {
      await saveThreadsOAuthConnection({ code, userId: session.data.user.id });
    } else {
      await saveGoogleOAuthConnection({ provider, code, userId: session.data.user.id });
    }
    auditSafely({
      actor: session.data.user.id,
      action: "integration.connect.callback",
      object: provider,
      status: "success",
      metadata: { provider },
    });
    const destination = new URL(verified.returnTo, url.origin);
    destination.searchParams.set(provider, "connected");
    return Response.redirect(destination, 302);
  } catch (error) {
    auditSafely({
      actor: session.data.user.id,
      action: "integration.connect.callback",
      object: provider,
      status: "failed",
      metadata: {
        provider,
        error: error instanceof Error ? error.message : "OAuth gagal.",
      },
    });
    return fail(
      409,
      "OAUTH_CALLBACK_FAILED",
      error instanceof Error ? error.message : "OAuth gagal.",
    );
  }
}

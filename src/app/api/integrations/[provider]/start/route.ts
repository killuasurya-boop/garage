import { fail } from "@/lib/api-response";
import { buildGoogleAuthorizationUrl } from "@/lib/garage-google-integrations";
import { buildMetaAuthorizationUrl } from "@/lib/garage-meta-publisher";
import { buildTikTokAuthorizationUrl } from "@/lib/garage-tiktok-publisher";
import { buildThreadsAuthorizationUrl } from "@/lib/garage-threads-publisher";
import { auditSafely } from "@/lib/garage-social-audit";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) return session.response;
  const { provider } = await context.params;
  const current = new URL(request.url);
  const returnTo = current.searchParams.get("returnTo") || "/?module=settings&scope=global";
  const common = { userId: session.data.user.id, returnTo };
  const audit = () =>
    auditSafely({
      actor: session.data.user.id,
      action: "integration.connect.start",
      object: provider,
      status: "recorded",
      metadata: { provider },
    });

  if (provider === "facebook" || provider === "instagram" || provider === "meta") {
    audit();
    return Response.redirect(buildMetaAuthorizationUrl(common), 302);
  }
  if (provider === "tiktok") {
    audit();
    return Response.redirect(buildTikTokAuthorizationUrl(common), 302);
  }
  if (provider === "threads") {
    audit();
    return Response.redirect(buildThreadsAuthorizationUrl(common), 302);
  }
  if (provider === "youtube" || provider === "google_business") {
    audit();
    return Response.redirect(
      buildGoogleAuthorizationUrl({ ...common, provider }),
      302,
    );
  }
  return fail(
    409,
    "INTEGRATION_MANUAL_SETUP",
    `${provider} menggunakan konfigurasi server atau proses review terpisah.`,
  );
}

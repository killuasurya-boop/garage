import { fail, ok } from "@/lib/api-response";
import { validateGoogleBusinessProfile } from "@/lib/garage-google-integrations";
import { auditSafely } from "@/lib/garage-social-audit";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST() {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) return session.response;
  try {
    const result = await validateGoogleBusinessProfile();
    auditSafely({
      actor: session.data.user.id,
      action: "integration.google_business.validate",
      object: "google_business",
      status: "success",
      metadata: { provider: "google_business" },
    });
    return ok(result);
  } catch (error) {
    auditSafely({
      actor: session.data.user.id,
      action: "integration.google_business.validate",
      object: "google_business",
      status: "failed",
      metadata: { error: error instanceof Error ? error.message : "Validasi GBP gagal." },
    });
    return fail(
      409,
      "GBP_VALIDATE_FAILED",
      error instanceof Error ? error.message : "Validasi GBP gagal.",
    );
  }
}

import { ok } from "@/lib/api-response";
import { disconnectGoogleDrive } from "@/lib/google-drive-upload";
import { createAuditLog } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function DELETE() {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  await disconnectGoogleDrive(session.data.user.id);

  void createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: "Google Drive OAuth disconnected",
    object: "GARAGE AI reports",
    device: session.data.profile.deviceLabel,
    status: "recorded",
    metadata: {
      authMode: "google_oauth",
    },
  }).catch(() => undefined);

  return ok({ disconnected: true });
}

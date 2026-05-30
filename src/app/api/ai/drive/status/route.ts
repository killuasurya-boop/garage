import { ok } from "@/lib/api-response";
import { googleDriveOAuthStatus } from "@/lib/google-drive-upload";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Admin",
    "Manager Operasional",
  ]);
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const userId =
    session.data.profile.role === "Owner / CEO" ? session.data.user.id : undefined;
  const status = await googleDriveOAuthStatus({
    userId,
    origin: url.origin,
  });

  return ok(status);
}

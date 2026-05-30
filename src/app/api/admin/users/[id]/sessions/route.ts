import { isDatabaseConfigured } from "@/db";
import { fail, ok } from "@/lib/api-response";
import { forceLogoutUser, listUserSessions } from "@/lib/admin-user-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const { id } = await context.params;
  const sessions = await listUserSessions(id);
  return ok({ sessions });
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const { id } = await context.params;
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") ?? undefined;
  await forceLogoutUser(id, sessionId, {
    actorUserId: session.data.user.id,
    actorName: session.data.user.name,
    deviceLabel: session.data.profile.deviceLabel,
  });
  return ok({ loggedOut: true });
}

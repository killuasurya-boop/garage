import { fail, ok } from "@/lib/api-response";
import { resolveServiceRequest } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter"]);
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const result = await resolveServiceRequest(id, session.data.user.id, session.data.profile.outlet.id);
  if (!result) {
    return fail(404, "SERVICE_REQUEST_NOT_FOUND", "Panggilan tidak ditemukan atau sudah selesai.");
  }
  return ok(result);
}

import { fail, ok } from "@/lib/api-response";
import { getCashSessionTransactions } from "@/lib/garage-service";
import { canUseApi } from "@/lib/role-access";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const data = await getCashSessionTransactions(id, session.data.user.id, {
    allowAll: canUseApi(session.data.profile.role, "finance:read"),
  });
  if (!data) {
    return fail(
      404,
      "CASH_SESSION_NOT_FOUND",
      "Sesi tidak ditemukan atau bukan milik kasir ini.",
    );
  }
  return ok(data);
}

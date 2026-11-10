import { fail, ok } from "@/lib/api-response";
import { canUseApi } from "@/lib/role-access";
import { requireAnyPermission } from "@/lib/server-auth";
import { getShiftCloseCheck } from "@/lib/shift-close-check-service";

export const runtime = "nodejs";

// Panel cek tutup shift (read-only). Akses sama dengan ringkasan shift; kas tunai
// & kas seharusnya tidak dikirim ke Kasir selama shift masih buka (blind count).
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) return session.response;

  const { id } = await context.params;
  const data = await getShiftCloseCheck(id, {
    userId: session.data.user.id,
    role: session.data.profile.role,
    allowAll: canUseApi(session.data.profile.role, "finance:read"),
  });
  if (!data) {
    return fail(404, "CASH_SESSION_NOT_FOUND", "Sesi tidak ditemukan atau bukan milik kasir ini.");
  }
  return ok(data);
}

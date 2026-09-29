import { fail, ok } from "@/lib/api-response";
import { AbsenEmployeeError, resetAbsenPin } from "@/lib/garage-absen-employees";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ code: string }>;
}

// PIN baru dikembalikan sekali di respons ini; yang disimpan hanya hash-nya.
export async function POST(_request: Request, { params }: Ctx) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  const { code } = await params;

  try {
    const res = await resetAbsenPin(code, {
      name: session.data!.user.name || session.data!.user.email,
      outletId: session.data!.profile.outlet.id,
    });
    return ok(res, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof AbsenEmployeeError) return fail(404, err.code, err.message);
    return fail(500, "PIN_RESET_FAILED", (err as Error).message);
  }
}

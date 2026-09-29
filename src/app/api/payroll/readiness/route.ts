import { fail, ok } from "@/lib/api-response";
import { getPayrollReadiness } from "@/lib/garage-payroll-readiness";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

// Cek kesiapan operasional payroll (GPS, PIN, aturan, uji coba, backup, ...).
export async function GET() {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  try {
    return ok(await getPayrollReadiness(), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return fail(500, "READINESS_FAILED", (err as Error).message);
  }
}

import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { requirePermission } from "@/lib/server-auth";
import { StaffProfileError, getStaffProfile360 } from "@/lib/staff-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Profil karyawan 360° (Owner/Manajer). NIK & rekening tersamar untuk non-Owner.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_STAFF_ID", "ID karyawan tidak valid.");
  try {
    return ok(await getStaffProfile360(id, session.data), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof StaffProfileError) return fail(error.status, error.code, error.message);
    console.error("Staff profile failed", error);
    return fail(500, "STAFF_PROFILE_FAILED", "Profil karyawan gagal dimuat.");
  }
}

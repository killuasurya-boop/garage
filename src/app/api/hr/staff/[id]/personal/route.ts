import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { requirePermission } from "@/lib/server-auth";
import { StaffProfileError, staffPersonalSchema, updateStaffPersonal } from "@/lib/staff-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ubah data diri karyawan. NIK & rekening bank hanya Owner.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_STAFF_ID", "ID karyawan tidak valid.");
  const body = await readJson(request, staffPersonalSchema);
  if (body.error) return body.error;
  try {
    return ok(await updateStaffPersonal(id, body.data, session.data));
  } catch (error) {
    if (error instanceof StaffProfileError) return fail(error.status, error.code, error.message);
    console.error("Update staff personal failed", error);
    return fail(500, "STAFF_PERSONAL_FAILED", "Data diri gagal disimpan.");
  }
}

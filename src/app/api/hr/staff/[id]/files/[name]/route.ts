import { z } from "zod";

import { fail } from "@/lib/api-response";
import { profileFileResponse, readProfileFile } from "@/lib/profile-file-storage";
import { requirePermission } from "@/lib/server-auth";
import { StaffProfileError, assertCanReadStaffFile } from "@/lib/staff-profile";

export const runtime = "nodejs";

// Buka dokumen karyawan — Owner/Manajer saja; file KTP hanya Owner.
export async function GET(_request: Request, context: { params: Promise<{ id: string; name: string }> }) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;
  const { id, name } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(404, "FILE_NOT_FOUND", "Dokumen tidak ditemukan.");
  try {
    await assertCanReadStaffFile(id, name, session.data);
  } catch (error) {
    if (error instanceof StaffProfileError) return fail(error.status, error.code, error.message);
    throw error;
  }
  const file = await readProfileFile("staff", id, name);
  if (!file) return fail(404, "FILE_NOT_FOUND", "Dokumen tidak ditemukan.");
  return profileFileResponse(file);
}

import { z } from "zod";

import { fail } from "@/lib/api-response";
import { profileFileResponse, readProfileFile } from "@/lib/profile-file-storage";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Foto member — hanya staf dengan akses CRM.
export async function GET(_request: Request, context: { params: Promise<{ id: string; name: string }> }) {
  const session = await requirePermission("crm:read");
  if (session.response) return session.response;
  const { id, name } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(404, "FILE_NOT_FOUND", "Foto tidak ditemukan.");
  const file = await readProfileFile("member", id, name);
  if (!file) return fail(404, "FILE_NOT_FOUND", "Foto tidak ditemukan.");
  return profileFileResponse(file);
}

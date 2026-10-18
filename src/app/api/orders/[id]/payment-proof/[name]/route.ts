import { z } from "zod";

import { fail } from "@/lib/api-response";
import { profileFileResponse, readProfileFile } from "@/lib/profile-file-storage";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Bukti transfer pelanggan — hanya staf yang mengurus order/kasir.
export async function GET(_request: Request, context: { params: Promise<{ id: string; name: string }> }) {
  const session = await requireAnyPermission(["orders:read", "pos:use", "finance:read"]);
  if (session.response) return session.response;
  const { id, name } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(404, "FILE_NOT_FOUND", "Bukti tidak ditemukan.");
  const file = await readProfileFile("payment", id, name);
  if (!file) return fail(404, "FILE_NOT_FOUND", "Bukti tidak ditemukan.");
  return profileFileResponse(file);
}

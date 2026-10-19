import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { setOrderArchived } from "@/lib/garage-service";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

// Arsip / pulihkan invoice — hanya menyembunyikan dari daftar, angka laporan tetap.
const schema = z.object({
  archived: z.boolean(),
  reason: z.string().trim().min(3, "Alasan minimal 3 karakter.").max(200),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    return ok(await setOrderArchived(id, body.data, session.data));
  } catch (error) {
    return fail(400, "ORDER_ARCHIVE_FAILED", error instanceof Error ? error.message : "Gagal mengubah arsip.");
  }
}

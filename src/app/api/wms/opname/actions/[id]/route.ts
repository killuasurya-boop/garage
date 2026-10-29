import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { ACTION_STATUSES, updateOpnameAction } from "@/lib/wms-opname-insights";

export const runtime = "nodejs";

const ROLES = ["Owner", "Manajer"] as const;
const schema = z.object({ status: z.enum(ACTION_STATUSES), note: z.string().max(500).optional() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(404, "ACTION_NOT_FOUND", "Tindak lanjut tidak ditemukan.");
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  if (parsed.data.status === "dismissed" && !parsed.data.note?.trim()) return fail(400, "NOTE_REQUIRED", "Alasan wajib diisi saat mengabaikan rekomendasi.");
  const row = await updateOpnameAction(id, parsed.data, session.data.user.id);
  if (!row) return fail(404, "ACTION_NOT_FOUND", "Tindak lanjut tidak ditemukan.");
  return ok(row);
}

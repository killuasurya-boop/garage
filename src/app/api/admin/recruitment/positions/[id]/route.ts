import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  deletePosition,
  updatePosition,
} from "@/lib/garage-recruitment-positions-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().min(1).max(80).optional(),
  location: z.string().trim().max(160).optional(),
  type: z.string().trim().max(80).optional(),
  experience: z.string().trim().max(240).optional(),
  description: z.string().trim().max(1000).optional(),
  isOpen: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

// PATCH update posisi (buka/tutup/edit) — admin only.
export async function PATCH(request: Request, context: RouteContext) {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) return session.response;

  const { id } = await context.params;
  const idResult = z.string().uuid().safeParse(id);
  if (!idResult.success) return fail(400, "INVALID_ID", "ID posisi tidak valid.");

  const body = await readJson(request, updateSchema);
  if (body.error) return body.error;

  const updated = await updatePosition(idResult.data, body.data);
  if (!updated) return fail(404, "POSITION_NOT_FOUND", "Posisi tidak ditemukan.");

  return ok({ position: updated });
}

// DELETE hapus posisi — CEO/Admin only.
export async function DELETE(_request: Request, context: RouteContext) {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) return session.response;

  const { id } = await context.params;
  const idResult = z.string().uuid().safeParse(id);
  if (!idResult.success) return fail(400, "INVALID_ID", "ID posisi tidak valid.");

  const deleted = await deletePosition(idResult.data);
  if (!deleted) return fail(404, "POSITION_NOT_FOUND", "Posisi tidak ditemukan.");

  return ok({ deleted: true });
}

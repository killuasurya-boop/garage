import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  createPosition,
  listAllPositions,
} from "@/lib/garage-recruitment-positions-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  location: z.string().trim().max(160).optional(),
  type: z.string().trim().max(80).optional(),
  experience: z.string().trim().max(240).optional(),
  description: z.string().trim().max(1000).optional(),
  isOpen: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// GET semua posisi (termasuk yang ditutup) — admin only.
export async function GET() {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) return session.response;

  const positions = await listAllPositions();
  return ok({ positions });
}

// POST buat posisi baru — admin only.
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) return session.response;

  const body = await readJson(request, createSchema);
  if (body.error) return body.error;

  try {
    const position = await createPosition(body.data);
    return ok({ position }, { status: 201 });
  } catch (error) {
    return fail(400, "POSITION_CREATE_FAILED", error instanceof Error ? error.message : "Gagal membuat posisi.");
  }
}

import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { getOutletTables, saveOutletTables } from "@/lib/garage-service";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const tableConfigSchema = z.object({
  tables: z
    .array(
      z.object({
        tableNumber: z.string().trim().min(1).max(8),
        area: z.string().trim().max(40).optional(),
        capacity: z.number().int().min(1).max(30).optional(),
        active: z.boolean(),
      }),
    )
    .min(1)
    .max(50),
});

// Master meja outlet staf yang login (jumlah, area, kapasitas, aktif).
export async function GET() {
  const session = await requirePermission("tables:read");
  if (session.response) {
    return session.response;
  }
  return ok(await getOutletTables(session.data.profile.outlet.id));
}

// Simpan master meja — hanya Owner/Manajer. Meja yang masih dipakai tamu tidak
// bisa dinonaktifkan (ditolak dengan pesan meja mana yang masih aktif).
export async function PUT(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, tableConfigSchema);
  if (body.error) {
    return body.error;
  }

  try {
    return ok(await saveOutletTables(body.data, session.data));
  } catch (error) {
    return fail(
      400,
      "TABLE_CONFIG_INVALID",
      error instanceof Error ? error.message : "Pengaturan meja gagal disimpan.",
    );
  }
}

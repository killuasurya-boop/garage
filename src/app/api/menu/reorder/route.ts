import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { reorderMenuProducts } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const reorderSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(80)).min(1).max(500),
});

// Simpan urutan tampil menu (panel Menu Digital → Atur urutan). Owner/Manajer saja.
export async function PATCH(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, reorderSchema);
  if (body.error) return body.error;

  try {
    return ok(await reorderMenuProducts(body.data.ids, session.data));
  } catch (error) {
    return fail(
      400,
      "MENU_REORDER_FAILED",
      error instanceof Error ? error.message : "Urutan menu gagal disimpan.",
    );
  }
}

import { ok } from "@/lib/api-response";
import { listOpnameCounts } from "@/lib/wms-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// Riwayat hitung (termasuk hitung pertama & stok sistem saat itu) — hanya untuk reviewer.
const OPNAME_ROLES = ["Owner", "Manajer"] as const;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...OPNAME_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  return ok(await listOpnameCounts(id));
}

import { lineupRoute } from "@/lib/event-lineup-route";
import { getPanitiaWorkspace } from "@/lib/event-panitia-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Ruang panitia: event tempat akun ini ditautkan sebagai panitia aktif (hak per jabatan dicek di server). */
export async function GET() {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter"]);
  if (session.response) return session.response;
  return lineupRoute(() => getPanitiaWorkspace(session.data));
}

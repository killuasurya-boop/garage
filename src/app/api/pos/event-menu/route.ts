import { ok } from "@/lib/api-response";
import { eventErrorResponse } from "@/lib/event-api";
import { getMainDigitalMenuEvent } from "@/lib/event-main-menu-service";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Paket event aktif (menu utama digital) untuk POS kasir; null bila tidak ada event berjalan. */
export async function GET() {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  try {
    const data = await getMainDigitalMenuEvent(session.data.profile.outlet.id);
    if (!data) return ok(null);
    return ok({ event: data.event, entries: data.entries.filter((entry) => entry.kind === "bundle"), products: data.products });
  } catch (error) {
    return eventErrorResponse(error, "Paket event gagal dimuat.");
  }
}

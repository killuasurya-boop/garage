import { ok } from "@/lib/api-response";
import { getKitchenData } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Waiter butuh lihat ticket lintas station (Bar + Food) tanpa filter role,
// supaya satu waiter bisa antar item dari kedua station. Permission
// "orders:read" sudah dimiliki Waiter 1/2 (lihat role-access.ts).
export async function GET() {
  const session = await requirePermission("orders:read");
  if (session.response) {
    return session.response;
  }

  // Tidak pakai viewerRole supaya tidak ke-clamp ke 1 station saja
  // (Koki→Food, Barista→Bar). Waiter selalu lihat semua station.
  const tickets = await getKitchenData({});
  // Hanya yang relevan untuk antar: queue/cooking utk awareness, ready utk action.
  const relevant = tickets.filter(
    (t) => t.status === "queue" || t.status === "cooking" || t.status === "ready",
  );
  return ok(relevant);
}

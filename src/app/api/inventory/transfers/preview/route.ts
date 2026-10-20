import { legacyInventoryGone } from "@/lib/legacy-inventory-api";

export const runtime = "nodejs";

export async function POST() {
  return legacyInventoryGone("Gudang → Internal Order (/warehouse/internal-order)");
}

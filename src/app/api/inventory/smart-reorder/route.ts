import { legacyInventoryGone } from "@/lib/legacy-inventory-api";

export const runtime = "nodejs";

export async function GET() {
  return legacyInventoryGone("Gudang → Smart Reorder (/warehouse/reorder)");
}

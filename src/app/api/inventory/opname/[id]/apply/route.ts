import { legacyInventoryGone } from "@/lib/legacy-inventory-api";

export const runtime = "nodejs";

export async function PATCH() {
  return legacyInventoryGone("Gudang → Stok Opname (/warehouse/opname)");
}

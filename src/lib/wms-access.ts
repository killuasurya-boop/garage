import { MANAGEMENT_ROLES } from "@/lib/role-access";
import type { WhType } from "@/lib/wms-types";

// =============================================================================
// GARAGE WMS — kontrol akses berbasis peran (client-safe: hanya string peran).
// Model scoping:
// - Peran ELEVATED (Owner/Manajer) → kelola gudang UTAMA + semua gudang:
//   receiving/inbound, master produk, koreksi stok, finalisasi opname.
// - Peran lain (Kasir/Waiter) → hanya operasi outlet: melihat stok & meminta
//   bahan (Internal Order). Tidak boleh menyentuh gudang utama.
// =============================================================================

export const WMS_ELEVATED_ROLES = MANAGEMENT_ROLES;

export function wmsIsElevated(role: string | null | undefined): boolean {
  return !!role && (WMS_ELEVATED_ROLES as readonly string[]).includes(role);
}

/** Tipe gudang yang boleh diakses peran. "all" = tak dibatasi (elevated). */
export function wmsAllowedWarehouseTypes(role: string | null | undefined): WhType[] | "all" {
  // Outlet hanya bar & dapur; gudang utama (main) khusus peran elevated.
  return wmsIsElevated(role) ? "all" : ["bar", "kitchen"];
}

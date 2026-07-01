import type { WhType } from "@/lib/wms-types";

// =============================================================================
// GARAGE WMS — kontrol akses berbasis peran (client-safe: hanya string peran).
// Model scoping:
// - Peran ELEVATED (Owner/Admin/Manager) → kelola gudang UTAMA + semua gudang:
//   receiving/inbound, master produk, koreksi stok, finalisasi opname.
// - Peran lain (staff outlet, mis. Barista) → hanya operasi outlet: melihat stok
//   & meminta bahan (Internal Order). Tidak boleh menyentuh gudang utama.
// =============================================================================

export const WMS_ELEVATED_ROLES = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
] as const;

export function wmsIsElevated(role: string | null | undefined): boolean {
  return !!role && (WMS_ELEVATED_ROLES as readonly string[]).includes(role);
}

/** Tipe gudang yang boleh diakses peran. "all" = tak dibatasi (elevated). */
export function wmsAllowedWarehouseTypes(role: string | null | undefined): WhType[] | "all" {
  // Outlet hanya bar & dapur; gudang utama (main) khusus peran elevated.
  return wmsIsElevated(role) ? "all" : ["bar", "kitchen"];
}

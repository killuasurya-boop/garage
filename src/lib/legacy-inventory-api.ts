import { fail } from "@/lib/api-response";

// Jalur gudang lama (stok lokasi OS, transfer/opname/penerimaan lama) sudah
// digantikan WMS /warehouse — satu ledger stok. Endpoint tulis lama ditutup
// (410) supaya tidak ada lagi perubahan stok di luar ledger WMS; data
// historisnya tetap bisa dibaca lewat GET/PDF yang masih tersedia.
export function legacyInventoryGone(replacement: string) {
  return fail(
    410,
    "LEGACY_INVENTORY_GONE",
    `Fitur gudang lama sudah dinonaktifkan. Gunakan ${replacement}.`,
  );
}

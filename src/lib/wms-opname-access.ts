import { fail } from "@/lib/api-response";
import { wmsAllowedWarehouseTypes } from "@/lib/wms-access";
import { getWmsOpnameWarehouseType } from "@/lib/wms-service";

/**
 * Izin lokasi untuk SEMUA endpoint opname (lihat, hitung, kirim): staf outlet hanya ruang
 * Bar/Dapur; gudang utama khusus Owner/Manajer. Mengembalikan Response error atau null bila boleh.
 */
export async function opnameAccessError(opnameId: string, role: string): Promise<Response | null> {
  const type = await getWmsOpnameWarehouseType(opnameId);
  if (!type) return fail(404, "OPNAME_NOT_FOUND", "Sesi opname tidak ditemukan.");
  const allowed = wmsAllowedWarehouseTypes(role);
  if (allowed !== "all" && !allowed.includes(type)) {
    return fail(403, "OPNAME_FORBIDDEN", "Opname gudang utama hanya untuk Owner/Manajer.");
  }
  return null;
}

import { fail, ok } from "@/lib/api-response";
import { getMaterialCatalog } from "@/lib/wms-material-request";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

/** ?division=bar|dapur → bahan yang bisa diminta + stok ruang & gudang utama. */
export async function GET(request: Request) {
  const session = await requirePermission("kitchen:read");
  if (session.response) return session.response;
  const division = new URL(request.url).searchParams.get("division");
  if (division !== "bar" && division !== "dapur") return fail(400, "DIVISION_INVALID", "Divisi harus bar atau dapur.");
  try {
    return ok(await getMaterialCatalog(division));
  } catch (e) {
    return fail(400, "MATERIAL_CATALOG_FAILED", e instanceof Error ? e.message : "Gagal memuat bahan.");
  }
}

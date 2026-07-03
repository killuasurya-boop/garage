import { fail, ok } from "@/lib/api-response";
import { importWmsProductsFromBuffer } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const maxBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(400, "INVALID_MULTIPART_FORM", "Kirim file Excel sebagai multipart/form-data (field 'file').");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return fail(400, "FILE_MISSING", "File Excel wajib diunggah.");
  if (file.size <= 0) return fail(400, "FILE_EMPTY", "File kosong.");
  if (file.size > maxBytes) return fail(413, "FILE_TOO_LARGE", "Ukuran file maksimal 5 MB.");

  // dryRun default true (pratinjau dulu). Set 'false' untuk benar-benar menyimpan.
  const dryRun = String(formData.get("dryRun") ?? "true") !== "false";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importWmsProductsFromBuffer(buffer, { dryRun }, session.data.user.id);
    return ok(result);
  } catch (e) {
    return fail(400, "IMPORT_FAILED", e instanceof Error ? e.message : "Gagal memproses file Excel.");
  }
}

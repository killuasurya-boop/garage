import { fail, ok } from "@/lib/api-response";
import { MAX_IMPORT_BYTES } from "@/lib/bulk-import";
import { importMenuProducts } from "@/lib/menu-import";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/menu/import (multipart: file .xlsx/.csv, dryRun=true|false)
 * Owner/Manajer. dryRun (default) = pratinjau per baris; false = simpan baris valid
 * dalam satu transaksi.
 */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(400, "INVALID_MULTIPART_FORM", "Kirim file sebagai multipart/form-data (field 'file').");
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return fail(400, "FILE_MISSING", "File .xlsx / .csv wajib diunggah.");
  if (!/\.(xlsx|csv)$/i.test(file.name)) return fail(400, "FILE_TYPE", "Format file harus .xlsx atau .csv.");
  if (file.size <= 0) return fail(400, "FILE_EMPTY", "File kosong.");
  if (file.size > MAX_IMPORT_BYTES) return fail(413, "FILE_TOO_LARGE", "Ukuran file maksimal 5 MB.");
  const dryRun = String(formData.get("dryRun") ?? "true") !== "false";

  try {
    const result = await importMenuProducts(Buffer.from(await file.arrayBuffer()), { dryRun, filename: file.name }, session.data);
    return ok(result);
  } catch (error) {
    return fail(400, "IMPORT_FAILED", error instanceof Error ? error.message : "Gagal memproses file impor.");
  }
}

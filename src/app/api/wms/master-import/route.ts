import { fail, ok } from "@/lib/api-response";
import { applyMasterImport, MasterImportError, previewMasterImport } from "@/lib/master-import";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

// Impor master Excel Garage Coffee (Owner): multipart `file` (.xlsx) + `mode`
// preview|apply. Tidak pernah mengubah produk, harga jual atau kategori POS.
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const mode = String(form?.get("mode") ?? "preview");
  if (!(file instanceof File)) return fail(400, "FILE_REQUIRED", "Pilih file master Excel (.xlsx).");
  if (!/\.xlsx$/i.test(file.name)) return fail(400, "FILE_TYPE", "File harus .xlsx.");
  if (file.size > MAX_BYTES) return fail(400, "FILE_TOO_LARGE", "File maksimal 10 MB.");
  if (mode !== "preview" && mode !== "apply") return fail(400, "MODE_INVALID", "Mode harus preview atau apply.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const actor = { id: session.data.user.id, name: session.data.user.name };
  try {
    const result =
      mode === "apply"
        ? await applyMasterImport({ buffer, fileName: file.name }, actor)
        : await previewMasterImport({ buffer, fileName: file.name }, actor);
    return ok(result);
  } catch (e) {
    if (e instanceof MasterImportError) return fail(422, "MASTER_IMPORT_INVALID", e.message);
    return fail(400, "MASTER_IMPORT_FAILED", e instanceof Error ? e.message : "Impor master gagal.");
  }
}

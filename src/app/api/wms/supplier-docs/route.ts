import { fail, ok } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { storeSupplierDoc } from "@/lib/wms-supplier-docs";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Unggah invoice / bukti bayar supplier (multipart field `file`) → path relatif privat. */
export async function POST(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "INVALID_MULTIPART_FORM", "Kirim file sebagai multipart/form-data (field 'file').");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "FILE_MISSING", "File wajib diunggah.");
  try {
    return ok({ path: await storeSupplierDoc(file) }, { status: 201 });
  } catch (e) {
    return fail(400, "FILE_INVALID", e instanceof Error ? e.message : "File tidak bisa diproses.");
  }
}

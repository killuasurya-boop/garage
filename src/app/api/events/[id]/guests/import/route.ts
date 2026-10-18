import { fail, ok } from "@/lib/api-response";
import { MAX_IMPORT_BYTES, templateCsv } from "@/lib/bulk-import";
import { eventActor, eventErrorResponse, invalidId } from "@/lib/event-api";
import { GUEST_IMPORT_COLUMNS, importGuests } from "@/lib/event-invitations";
import { createAuditLog } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

// GET: template CSV tamu.
export async function GET(_request: Request, context: Context) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  const bad = invalidId(id);
  if (bad) return bad;
  const csv = templateCsv(GUEST_IMPORT_COLUMNS, [
    ["Budi Santoso", "081234567890", "2", "Teman owner"],
    ["Sari Dewi", "0813 1111 2222", "1", ""],
  ]);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="template-tamu-undangan.csv"',
      "cache-control": "no-store",
    },
  });
}

// POST multipart (file .csv/.xlsx, dryRun=true|false). dryRun default true = pratinjau.
export async function POST(request: Request, context: Context) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  const bad = invalidId(id);
  if (bad) return bad;
  const form = await request.formData().catch(() => null);
  if (!form) return fail(400, "INVALID_MULTIPART_FORM", "Kirim file sebagai multipart/form-data (field 'file').");
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "FILE_MISSING", "File .csv / .xlsx wajib diunggah.");
  if (!/\.(xlsx|csv)$/i.test(file.name)) return fail(400, "FILE_TYPE", "Format file harus .csv atau .xlsx.");
  if (file.size <= 0) return fail(400, "FILE_EMPTY", "File kosong.");
  if (file.size > MAX_IMPORT_BYTES) return fail(413, "FILE_TOO_LARGE", "Ukuran file maksimal 5 MB.");
  const dryRun = String(form.get("dryRun") ?? "true") !== "false";
  try {
    const result = await importGuests(id, Buffer.from(await file.arrayBuffer()), { filename: file.name, dryRun }, eventActor(session.data));
    if (!dryRun) {
      await createAuditLog({
        actor: eventActor(session.data).name,
        action: "Event: impor tamu",
        object: file.name.slice(0, 80),
        device: session.data.profile.deviceLabel ?? "OS",
        metadata: { eventId: id, ...result.summary },
      }).catch(() => undefined);
    }
    return ok(result);
  } catch (error) {
    return eventErrorResponse(error, "Gagal memproses file impor.");
  }
}

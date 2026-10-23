import { z } from "zod";
import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { applyMaterialReference, getMaterialReference, previewMaterialReference } from "@/lib/material-reference";
import { MaterialReferenceError } from "@/lib/material-reference-plan";
import { GARAGE_MATERIAL_REFERENCE_FILENAME, GARAGE_MATERIAL_REFERENCE_SOURCE } from "@/lib/garage-material-reference-source";

export const runtime = "nodejs";
const confirmationsSchema = z.array(z.object({ sourceSku: z.string().trim().regex(/^(BAR|KIT)-\d{3}$/),
  canonicalUnit: z.string().trim().min(1).max(20), packageQty: z.number().positive().max(1_000_000_000),
  costBasis: z.literal("package") }).strict()).max(2000);

export async function GET() {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  return ok(await getMaterialReference());
}

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const form = await request.formData().catch(() => null);
  if (!form) return fail(400, "FORM_INVALID", "Kirim file CSV atau pilih DATA GUDANG.");
  const mode = String(form.get("mode") ?? "preview");
  if (mode !== "preview" && mode !== "apply") return fail(400, "MODE_INVALID", "Mode harus preview atau apply.");
  const source = form.get("source");
  const file = form.get("file");
  let buffer: Buffer;
  let fileName: string;
  if (source === "garage-2026-10-23") {
    if (file instanceof File) return fail(400, "SOURCE_AMBIGUOUS", "Pilih sumber bawaan atau unggahan, bukan keduanya.");
    buffer = Buffer.from(GARAGE_MATERIAL_REFERENCE_SOURCE, "utf8"); fileName = GARAGE_MATERIAL_REFERENCE_FILENAME;
  } else {
    if (!(file instanceof File)) return fail(400, "FILE_REQUIRED", "Pilih DATA GUDANG atau unggah CSV bahan.");
    if (!/\.csv$/i.test(file.name)) return fail(400, "FILE_TYPE", "File harus CSV.");
    if (file.size > 2 * 1024 * 1024) return fail(400, "FILE_TOO_LARGE", "CSV maksimal 2 MB.");
    buffer = Buffer.from(await file.arrayBuffer()); fileName = file.name;
  }
  try {
    const confirmations = confirmationsSchema.parse(JSON.parse(String(form.get("confirmations") ?? "[]")));
    const applyMetadataRaw = form.get("applyMetadata");
    if (applyMetadataRaw !== null && applyMetadataRaw !== "true" && applyMetadataRaw !== "false") return fail(400, "METADATA_INVALID", "applyMetadata harus true atau false.");
    const input = { buffer, fileName, confirmations, applyMetadata: applyMetadataRaw !== "false" };
    return ok(mode === "apply"
      ? await applyMaterialReference(input, { id: session.data.user.id, name: session.data.user.name })
      : await previewMaterialReference(input));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return fail(400, "CONFIRMATION_INVALID", "Konfirmasi satuan dan isi kemasan tidak valid.");
    if (error instanceof MaterialReferenceError) return fail(422, "MATERIAL_REFERENCE_INVALID", error.message);
    return fail(500, "MATERIAL_REFERENCE_FAILED", "Referensi bahan belum dapat diproses. Muat ulang dan coba kembali.");
  }
}

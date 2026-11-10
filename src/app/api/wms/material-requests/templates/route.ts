import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { deleteMaterialTemplate, listMaterialTemplates, saveMaterialTemplate } from "@/lib/wms-material-request";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// M4: paket permintaan rutin per divisi ("Buka toko Bar", "Persiapan malam").

const divisionSchema = z.enum(["bar", "dapur"]);
const saveSchema = z.object({
  division: divisionSchema,
  name: z.string().trim().min(1).max(40),
  items: z.array(z.object({ productId: z.string().uuid(), qty: z.number().positive().max(1_000_000) })).min(1).max(60),
});

export async function GET(request: Request) {
  const session = await requirePermission("kitchen:read");
  if (session.response) return session.response;
  const division = divisionSchema.safeParse(new URL(request.url).searchParams.get("division"));
  if (!division.success) return fail(400, "DIVISION_INVALID", "Divisi harus bar atau dapur.");
  return ok(await listMaterialTemplates(division.data, session.data.profile.outlet?.id ?? null));
}

export async function POST(request: Request) {
  const session = await requirePermission("kitchen:write");
  if (session.response) return session.response;
  const body = await readJson(request, saveSchema);
  if (body.error) return body.error;
  try {
    const actor = { userId: session.data.user.id, outletId: session.data.profile.outlet?.id ?? null };
    return ok(await saveMaterialTemplate(body.data.division, { name: body.data.name, items: body.data.items }, actor));
  } catch (e) {
    return fail(400, "MATERIAL_TEMPLATE_FAILED", e instanceof Error ? e.message : "Gagal menyimpan paket.");
  }
}

export async function DELETE(request: Request) {
  const session = await requirePermission("kitchen:write");
  if (session.response) return session.response;
  const params = new URL(request.url).searchParams;
  const division = divisionSchema.safeParse(params.get("division"));
  const name = params.get("name")?.trim() ?? "";
  if (!division.success || !name) return fail(400, "MATERIAL_TEMPLATE_INVALID", "Divisi & nama paket wajib.");
  try {
    const actor = { userId: session.data.user.id, outletId: session.data.profile.outlet?.id ?? null };
    return ok(await deleteMaterialTemplate(division.data, name, actor));
  } catch (e) {
    return fail(400, "MATERIAL_TEMPLATE_FAILED", e instanceof Error ? e.message : "Gagal menghapus paket.");
  }
}

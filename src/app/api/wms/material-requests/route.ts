import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createMaterialRequest, listMaterialRequests } from "@/lib/wms-material-request";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const division = z.enum(["bar", "dapur"]);
const STATUSES = ["submitted", "sent", "received", "cancelled"] as const;

const createSchema = z.object({
  division,
  urgent: z.boolean().optional(),
  note: z.string().trim().max(300).optional(),
  items: z
    .array(z.object({ productId: z.string().uuid(), qty: z.number().positive().max(1_000_000), note: z.string().trim().max(120).optional() }))
    .min(1)
    .max(100),
});

/** ?division=bar|dapur&status=submitted,sent → daftar permintaan bahan (terbaru & urgent dulu). */
export async function GET(request: Request) {
  const session = await requirePermission("kitchen:read");
  if (session.response) return session.response;
  const params = new URL(request.url).searchParams;
  const div = division.safeParse(params.get("division"));
  const status = (params.get("status") ?? "").split(",").filter((s): s is (typeof STATUSES)[number] => (STATUSES as readonly string[]).includes(s));
  return ok(await listMaterialRequests({ division: div.success ? div.data : undefined, status }));
}

/** Karyawan Bar/Dapur kirim daftar belanja ke gudang (tanpa approval, manajer dapat notifikasi). */
export async function POST(request: Request) {
  const session = await requirePermission("kitchen:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;
  try {
    const row = await createMaterialRequest(parsed.data, {
      userId: session.data.user.id,
      name: session.data.user.name,
      outletId: session.data.profile.outlet?.id ?? null,
    });
    return ok(row, { status: 201 });
  } catch (e) {
    return fail(400, "MATERIAL_REQUEST_FAILED", e instanceof Error ? e.message : "Gagal mengirim permintaan bahan.");
  }
}

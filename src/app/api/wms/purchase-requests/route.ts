import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createPurchaseRequest, listPurchaseRequests, ProcurementError } from "@/lib/wms-procurement";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  area: z.enum(["bar", "dapur", "umum"]),
  priority: z.enum(["normal", "urgent"]).optional(),
  note: z.string().trim().max(500).optional(),
  items: z
    .array(z.object({ productId: z.string().uuid(), qty: z.number().positive(), note: z.string().trim().max(200).optional() }))
    .min(1)
    .max(100),
});

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const url = new URL(request.url);
  const status = url.searchParams.get("status")?.split(",").filter(Boolean);
  const area = url.searchParams.get("area");
  return ok(
    await listPurchaseRequests({
      status,
      area: area === "bar" || area === "dapur" || area === "umum" ? area : undefined,
    }),
  );
}

// Bar/Dapur (inventory:write) mengajukan kebutuhan; TIDAK mengubah stok.
export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;
  try {
    const actor = { id: session.data.user.id, name: session.data.user.name, role: session.data.profile.role };
    return ok(await createPurchaseRequest(parsed.data, actor), { status: 201 });
  } catch (e) {
    if (e instanceof ProcurementError) return fail(409, "PURCHASE_REQUEST_INVALID", e.message);
    return fail(400, "PURCHASE_REQUEST_FAILED", e instanceof Error ? e.message : "Gagal membuat permintaan.");
  }
}

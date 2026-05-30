import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createSupplierReceiving, listSupplierReceivings } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function canPostSupplierReceiving(role: string) {
  return role === "Owner / CEO" || role === "Admin" || role === "Gudang";
}

const receivingSchema = z.object({
  supplierId: z.string().uuid().nullable().optional(),
  invoiceNo: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1),
        qty: z.number().positive(),
        unitCost: z.number().nonnegative(),
        note: z.string().trim().max(240).optional(),
      }),
    )
    .min(1),
});

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit"));
  return ok({ receivings: await listSupplierReceivings({ limit: Number.isFinite(limit) ? limit : undefined }) });
}

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  if (!canPostSupplierReceiving(session.data.profile.role)) {
    return fail(403, "FORBIDDEN", "Hanya Owner/Admin/Gudang yang bisa posting barang masuk supplier.");
  }

  const body = await readJson(request, receivingSchema);
  if (body.error) return body.error;

  try {
    return ok(await createSupplierReceiving(body.data, session.data), { status: 201 });
  } catch (error) {
    return fail(
      400,
      "SUPPLIER_RECEIVING_FAILED",
      error instanceof Error ? error.message : "Supplier receiving gagal diposting.",
    );
  }
}

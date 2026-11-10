import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createWmsProduct, getWmsProducts } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { masterActor, withMasterErrors } from "@/lib/wms-master-route";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  // Kosong/tidak dikirim = SKU otomatis dari prefix kategori (dibuat & dikunci di server).
  sku: z
    .string()
    .trim()
    .max(40)
    .regex(/^$|^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/, "SKU hanya huruf, angka, titik, strip, garis bawah.")
    .optional(),
  name: z.string().trim().min(2).max(140),
  category: z.string().trim().min(2).max(80),
  subcategory: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(80).optional(),
  defaultSupplierId: z.string().uuid().nullable().optional(),
  unit: z.string().trim().min(1).max(24),
  minStock: z.number().nonnegative().max(10_000_000).optional(),
  parStock: z.number().nonnegative().max(10_000_000).optional(),
  hpp: z.number().nonnegative().max(100_000_000).optional(),
  // Harga beli per kemasan + isi kemasan (satuan stok) → HPP per satuan otomatis.
  packPrice: z.number().nonnegative().max(1_000_000_000).optional(),
  packQty: z.number().positive().max(100_000_000).optional(),
  packName: z.string().trim().max(40).optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  initialStock: z.number().nonnegative().max(100_000_000).optional(),
  initialWarehouseId: z.string().uuid().nullable().optional(),
});

const AREAS = new Set(["bar", "dapur", "umum"]);

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const area = url.searchParams.get("area");
  return ok(
    await getWmsProducts({
      search: url.searchParams.get("search") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      warehouseId: url.searchParams.get("warehouse") ?? undefined,
      archived: url.searchParams.get("archived") === "1" ? "archived" : "active",
      supplierId: url.searchParams.get("supplier") ?? undefined,
      area: area && AREAS.has(area) ? (area as "bar" | "dapur" | "umum") : undefined,
    }),
  );
}

export async function POST(request: Request) {
  // Master produk (bahan + HPP awal) = data inti → peran elevated.
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;

  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;

  return withMasterErrors(async () =>
    ok(await createWmsProduct(parsed.data, session.data.user.id, undefined, masterActor(session.data)), { status: 201 }),
  );
}

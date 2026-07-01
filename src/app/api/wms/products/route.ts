import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createWmsProduct, getWmsProducts } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  sku: z.string().trim().min(2).max(60),
  name: z.string().trim().min(2).max(140),
  category: z.string().trim().min(2).max(80),
  unit: z.string().trim().min(1).max(24),
  minStock: z.number().nonnegative().max(10_000_000).optional(),
  hpp: z.number().nonnegative().max(100_000_000).optional(),
});

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  return ok(
    await getWmsProducts({
      search: url.searchParams.get("search") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      warehouseId: url.searchParams.get("warehouse") ?? undefined,
    }),
  );
}

export async function POST(request: Request) {
  // Master produk (bahan + HPP awal) = data inti → peran elevated.
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;

  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;

  return ok(await createWmsProduct(parsed.data, session.data.user.id), { status: 201 });
}

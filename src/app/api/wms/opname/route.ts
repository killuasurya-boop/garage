import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createWmsOpname, listWmsOpnames } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({ warehouseId: z.string().uuid() });

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  return ok(await listWmsOpnames());
}

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;
  return ok(await createWmsOpname(parsed.data.warehouseId, session.data.user.id), { status: 201 });
}

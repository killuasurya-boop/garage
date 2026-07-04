import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createChecklistRun, listChecklistRuns } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  type: z.enum(["daily", "receiving", "opname"]),
  warehouseId: z.string().uuid().nullable().optional(),
  refId: z.string().max(80).nullable().optional(),
});

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const type = new URL(request.url).searchParams.get("type") as "daily" | "receiving" | "opname" | null;
  return ok(await listChecklistRuns(type ?? undefined));
}

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;
  return ok(await createChecklistRun(parsed.data, session.data.user.id), { status: 201 });
}

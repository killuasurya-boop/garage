import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createWmsCategory, installStandardWmsCategories, listWmsCategories } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { masterActor, withMasterErrors } from "@/lib/wms-master-route";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.union([
  z.object({
    name: z.string().trim().min(2).max(80),
    area: z.enum(["bar", "dapur", "umum"]).optional(),
  }),
  // Pasang kategori contoh Garage (Kopi, Susu, … / Protein, Bumbu, … / Kebersihan).
  z.object({ installStandard: z.literal(true) }),
]);

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const includeArchived = new URL(request.url).searchParams.get("archived") === "1";
  return ok(await listWmsCategories({ includeArchived }));
}

export async function POST(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;
  const actor = masterActor(session.data);
  return withMasterErrors(async () => {
    if ("installStandard" in parsed.data) return ok(await installStandardWmsCategories(actor));
    return ok(await createWmsCategory(parsed.data, actor), { status: 201 });
  });
}

import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { getAppSettings, updateAppSettings } from "@/lib/garage-service";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const patchSchema = z.object({ wmsAutoConsume: z.boolean() });

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const settings = await getAppSettings(session.data.profile.outlet.id);
  return ok({ wmsAutoConsume: settings.wmsAutoConsume });
}

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) return session.response;
  const parsed = await readJson(request, patchSchema);
  if (parsed.error) return parsed.error;
  const updated = await updateAppSettings(
    session.data.profile.outlet.id,
    { wmsAutoConsume: parsed.data.wmsAutoConsume },
    session.data,
  );
  return ok({ wmsAutoConsume: updated.wmsAutoConsume });
}

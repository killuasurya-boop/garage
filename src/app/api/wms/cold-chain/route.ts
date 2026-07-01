import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { addColdChainReading, getWmsColdChain } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ unitCode: z.string().trim().min(1).max(40), tempC: z.number() });

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  return ok(await getWmsColdChain());
}

// Webhook IoT — kirim bacaan suhu.
export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  return ok(await addColdChainReading(parsed.data.unitCode, parsed.data.tempC), { status: 201 });
}

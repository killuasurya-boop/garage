import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { addColdChainReading, getWmsColdChain } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ unitCode: z.string().trim().min(1).max(40), tempC: z.number() });

function checkColdChainSecret(request: Request): boolean {
  const secret = process.env.WMS_COLD_CHAIN_SECRET?.trim();
  if (!secret) return false;
  const provided = request.headers.get("x-wms-cold-chain-secret")?.trim();
  if (!provided || provided.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  return ok(await getWmsColdChain());
}

/** Webhook IoT — kirim bacaan suhu (API key atau sesi ber-izin). */
export async function POST(request: Request) {
  if (checkColdChainSecret(request)) {
    const parsed = await readJson(request, schema);
    if (parsed.error) return parsed.error;
    return ok(await addColdChainReading(parsed.data.unitCode, parsed.data.tempC), { status: 201 });
  }
  const session = await requirePermission("inventory:write");
  if (session.response) {
    return process.env.WMS_COLD_CHAIN_SECRET
      ? fail(401, "WEBHOOK_UNAUTHORIZED", "API key atau sesi ber-izin diperlukan.")
      : session.response;
  }
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  return ok(await addColdChainReading(parsed.data.unitCode, parsed.data.tempC), { status: 201 });
}

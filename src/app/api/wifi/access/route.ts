import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { requireMemberAuth } from "@/lib/member-auth";
import { rateLimit } from "@/lib/rate-limit";
import { WifiError, grantMemberWifi } from "@/lib/wifi-hotspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  mac: z.string().max(40).optional().nullable(),
  ip: z.string().max(40).optional().nullable(),
  loginUrl: z.string().max(300),
});

// Member yang login → kredensial hotspot hari ini + catat pemakaian WiFi.
export async function POST(request: Request) {
  // Banyak pelanggan berbagi IP NAT hotspot → batas lebih longgar.
  const limited = rateLimit(request, "wifi-access", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requireMemberAuth(request);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  try {
    const grant = await grantMemberWifi(session.data.customer.id, body.data);
    return ok(grant, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof WifiError) return fail(error.status, error.code, error.message);
    console.error("WiFi access failed", error);
    return fail(500, "WIFI_ACCESS_FAILED", "WiFi gagal diaktifkan. Coba lagi.");
  }
}

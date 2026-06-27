import { ok } from "@/lib/api-response";
import { getTikTokConnectionStatus } from "@/lib/garage-tiktok-publisher";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requirePermission("marketing:read");
  if (session.response) return session.response;
  return ok(await getTikTokConnectionStatus());
}

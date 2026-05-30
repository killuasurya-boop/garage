import { ok } from "@/lib/api-response";
import { listOutlets } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission("dashboard:read");
  if (session.response) return session.response;

  const data = await listOutlets();
  return ok({ outlets: data });
}

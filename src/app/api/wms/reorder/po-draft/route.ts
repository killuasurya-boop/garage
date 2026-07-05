import { ok } from "@/lib/api-response";
import { generateWmsPoDraft } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST() {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  return ok(await generateWmsPoDraft());
}

import { ok } from "@/lib/api-response";
import { runSmartAlertSweep } from "@/lib/chat-bot-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await requirePermission("chat:use");
  if (session.response) return session.response;

  const report = await runSmartAlertSweep();
  return ok(report);
}

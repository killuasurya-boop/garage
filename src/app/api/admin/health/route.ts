import { ok } from "@/lib/api-response";
import { generateBackupGuide, getSystemHealth } from "@/lib/garage-health-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  const health = await getSystemHealth();
  const backupGuide = generateBackupGuide();
  return ok({ health, backupGuide });
}

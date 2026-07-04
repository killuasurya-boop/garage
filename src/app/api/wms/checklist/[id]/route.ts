import { fail, ok } from "@/lib/api-response";
import { completeChecklistRun, getChecklistRun } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  const run = await getChecklistRun(id);
  if (!run) return fail(404, "CHECKLIST_NOT_FOUND", "Checklist tidak ditemukan.");
  return ok(run);
}

// Selesaikan checklist.
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const { id } = await context.params;
  const row = await completeChecklistRun(id);
  if (!row) return fail(404, "CHECKLIST_NOT_FOUND", "Checklist tidak ditemukan.");
  return ok({ completed: true });
}

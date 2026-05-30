import { type NextRequest } from "next/server";

import { ok } from "@/lib/api-response";
import { updateAuditCase } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("audit:read");
  if (session.response) return session.response;

  const { id } = await params;
  const body = await req.json();
  const updated = await updateAuditCase(id, {
    status: body.status,
    severity: body.severity,
    assignedTo: body.assignedTo,
    description: body.description,
  });
  return ok(updated);
}

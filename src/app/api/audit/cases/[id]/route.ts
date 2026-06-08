import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { updateAuditCase } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateCaseSchema = z.object({
  status: z.string().max(40).optional(),
  severity: z.string().max(40).optional(),
  assignedTo: z.string().max(160).optional(),
  description: z.string().max(8000).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("audit:read");
  if (session.response) return session.response;

  const { id } = await params;
  const parsed = await readJson(req, updateCaseSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;
  const updated = await updateAuditCase(id, {
    status: body.status,
    severity: body.severity,
    assignedTo: body.assignedTo,
    description: body.description,
  });
  return ok(updated);
}

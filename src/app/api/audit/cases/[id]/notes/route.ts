import { type NextRequest } from "next/server";

import { ok } from "@/lib/api-response";
import { addAuditCaseNote } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("audit:read");
  if (session.response) return session.response;

  const { id } = await params;
  const body = await req.json();
  const updated = await addAuditCaseNote(id, {
    by: session.data!.user.id,
    byName: session.data!.user.name,
    text: body.text ?? "",
  });
  return ok(updated);
}

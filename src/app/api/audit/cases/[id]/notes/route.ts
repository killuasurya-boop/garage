import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { addAuditCaseNote } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noteSchema = z.object({
  text: z.string().trim().min(1).max(8000),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("audit:read");
  if (session.response) return session.response;

  const { id } = await params;
  const parsed = await readJson(req, noteSchema);
  if (parsed.error) return parsed.error;
  const updated = await addAuditCaseNote(id, {
    by: session.data!.user.id,
    byName: session.data!.user.name,
    text: parsed.data.text,
  });
  return ok(updated);
}

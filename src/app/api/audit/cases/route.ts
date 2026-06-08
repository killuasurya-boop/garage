import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createAuditCase, listAuditCases } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createCaseSchema = z.object({
  flagKind: z.string().max(60).optional(),
  severity: z.string().max(40).optional(),
  actorName: z.string().max(160).optional(),
  title: z.string().max(300).optional(),
  description: z.string().max(8000).optional(),
});

export async function GET(req: Request) {
  const session = await requirePermission("audit:read");
  if (session.response) return session.response;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const severity = url.searchParams.get("severity") ?? undefined;
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const data = await listAuditCases({ status, severity, limit, offset });
  return ok(data);
}

export async function POST(req: Request) {
  const session = await requirePermission("audit:read");
  if (session.response) return session.response;

  const parsed = await readJson(req, createCaseSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;
  const created = await createAuditCase({
    flagKind: body.flagKind ?? "manual",
    severity: body.severity ?? "watch",
    actorName: body.actorName,
    title: body.title ?? "Audit case manual",
    description: body.description,
    createdBy: session.data!.user.id,
  });
  return ok(created);
}

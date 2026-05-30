import { ok } from "@/lib/api-response";
import {
  aiApprovalStatuses,
  listAiActionDrafts,
  listAiActionRegistry,
} from "@/lib/garage-ai-agents";
import type { AiApprovalStatus } from "@/lib/garage-api-types";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

function parseStatus(request: Request) {
  const status = new URL(request.url).searchParams.get("status");

  if (!status || !aiApprovalStatuses.includes(status as AiApprovalStatus)) {
    return undefined;
  }

  return status as AiApprovalStatus;
}

export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) {
    return session.response;
  }

  return ok({
    actions: await listAiActionDrafts(parseStatus(request)),
    registry: await listAiActionRegistry(),
  });
}

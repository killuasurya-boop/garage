import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { selectMetaPage } from "@/lib/garage-meta-publisher";
import { auditSafely } from "@/lib/garage-social-audit";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ pageId: z.string().trim().min(1).max(255) });

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  try {
    const result = await selectMetaPage(body.data.pageId);
    auditSafely({
      actor: session.data.user.id,
      action: "integration.meta.select_page",
      object: body.data.pageId,
      status: "success",
      metadata: result,
    });
    return ok(result);
  } catch (error) {
    auditSafely({
      actor: session.data.user.id,
      action: "integration.meta.select_page",
      object: body.data.pageId,
      status: "failed",
      metadata: { error: error instanceof Error ? error.message : "Facebook Page tidak ditemukan." },
    });
    return fail(
      404,
      "META_PAGE_NOT_FOUND",
      error instanceof Error ? error.message : "Facebook Page tidak ditemukan.",
    );
  }
}

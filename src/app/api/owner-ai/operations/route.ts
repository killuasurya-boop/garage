import { fail, ok } from "@/lib/api-response";
import { listOwnerOperations } from "@/lib/owner-ai-commands";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Timeline operasi R2/R3 Owner (ChatGPT + layar Owner), terbaru dulu. */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  if (session.data.profile.agentKey) return fail(403, "FORBIDDEN", "Timeline operasi hanya dari layar Owner.");
  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const operations = await listOwnerOperations(session.data.user.id, {
    limit: Number.isFinite(limit) ? limit : 50,
    source: source === "chatgpt" || source === "garage_owner_ui" ? source : undefined,
  });
  return ok({ operations }, { headers: { "cache-control": "no-store" } });
}

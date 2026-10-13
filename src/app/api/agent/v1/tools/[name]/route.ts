import { fail } from "@/lib/api-response";
import { runToolResponse } from "@/lib/agent-http";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ name: string }> };

/**
 * GET /api/agent/v1/tools/{name}?args={json} — jalankan tool baca (cocok untuk
 * key baca-saja). Argumen juga boleh sebagai query biasa (?from=…&to=…).
 */
export async function GET(request: Request, ctx: Ctx) {
  const session = await requireGarageSession();
  if (session.response) return session.response;
  const { name } = await ctx.params;
  const url = new URL(request.url);
  let args: Record<string, unknown> = {};
  const raw = url.searchParams.get("args");
  if (raw) {
    try {
      args = JSON.parse(raw);
    } catch {
      return fail(400, "INVALID_ARGS", "Parameter args harus JSON.");
    }
  } else {
    for (const [key, value] of url.searchParams.entries()) args[key] = value;
  }
  return runToolResponse(session.data, name, args);
}

/** POST /api/agent/v1/tools/{name} body = argumen JSON. */
export async function POST(request: Request, ctx: Ctx) {
  const session = await requireGarageSession();
  if (session.response) return session.response;
  const { name } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  return runToolResponse(session.data, name, body ?? {});
}

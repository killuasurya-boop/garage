import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { AGENT_SCOPES, createAgentKey, listAgentKeys } from "@/lib/agent-api-key";
import { requireHumanSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agent-keys — daftar API key agent (Owner login langsung). */
export async function GET() {
  const session = await requireHumanSession(["Owner"]);
  if (session.response) return session.response;
  return ok({ keys: await listAgentKeys() });
}

const schema = z.object({
  label: z.string().trim().min(2).max(60),
  scope: z.enum(AGENT_SCOPES),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]).default(90),
});

/** POST /api/agent-keys — buat key; key mentah dikembalikan SEKALI. */
export async function POST(request: Request) {
  const session = await requireHumanSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  try {
    const created = await createAgentKey(body.data, session.data);
    return ok(created, { status: 201 });
  } catch (error) {
    return fail(400, "AGENT_KEY_CREATE_FAILED", error instanceof Error ? error.message : "Gagal membuat API key.");
  }
}

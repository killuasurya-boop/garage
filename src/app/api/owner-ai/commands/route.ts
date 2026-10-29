import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { AgentToolError } from "@/lib/agent-tools";
import { listOwnerCommandTools, runOwnerCommand } from "@/lib/owner-ai-commands";
import { hitRateLimit } from "@/lib/rate-limit-db";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function ownerFromScreen() {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return { response: session.response } as const;
  // Layar Owner saja — API key/agent (termasuk kunci delegasi ChatGPT) ditolak.
  if (session.data.profile.agentKey) return { response: fail(403, "FORBIDDEN", "AI Command Center hanya dari layar Owner.") } as const;
  return { session: session.data } as const;
}

/** Katalog tool per domain (mesin yang sama dengan ChatGPT) + skema input untuk form. */
export async function GET() {
  const owner = await ownerFromScreen();
  if ("response" in owner) return owner.response;
  return ok({ domains: listOwnerCommandTools(owner.session) }, { headers: { "cache-control": "no-store" } });
}

const runSchema = z.object({
  tool: z.string().min(2).max(80),
  args: z.record(z.string(), z.unknown()).default({}),
  konfirmasi: z.string().max(200).nullish(),
  kode2fa: z.string().trim().max(6).nullish(),
});

/**
 * Jalankan tool: R0/R1 langsung; R2/R3 panggilan pertama = preview + token (TIDAK dijalankan),
 * panggilan kedua dengan argumen sama + `konfirmasi` (+ `kode2fa` untuk R3) = eksekusi + receipt.
 */
export async function POST(request: Request) {
  const owner = await ownerFromScreen();
  if ("response" in owner) return owner.response;
  const body = await readJson(request, runSchema);
  if (body.error) return body.error;
  const limited = await hitRateLimit(`owner-ai-command:${owner.session.user.id}`, { limit: 30, windowMs: 60_000 });
  if (limited.limited) return fail(429, "RATE_LIMITED", "Terlalu banyak perintah dalam 1 menit. Tunggu sebentar.");
  try {
    const result = await runOwnerCommand(owner.session, body.data);
    return ok({ result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AgentToolError) return fail(error.status, error.code, error.message);
    console.error("[owner-ai] command failed", body.data.tool, error);
    return fail(500, "EXECUTION_FAILED", "Perintah gagal dijalankan. Cek status operasi sebelum mengulang.");
  }
}

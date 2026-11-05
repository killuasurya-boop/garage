import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createAuditLog } from "@/lib/garage-service";
import { runGarageProblemSolver } from "@/lib/garage-problem-solver-service";
import { rateLimit } from "@/lib/rate-limit";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  message: z.string().trim().min(5).max(3000),
  mode: z.enum(["quick", "full"]).optional().default("quick"),
  withAi: z.boolean().optional().default(true),
});

/** Owner-only; never changes business data. All actions remain draft-only. */
export async function POST(request: Request) {
  const limited = rateLimit(request, "ai-problem-solver", { limit: 8, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  try {
    await createAuditLog({
      actor: session.data.user.name,
      action: "AYA Problem Solver V4 investigasi dibuka",
      object: "owner_problem_solver",
      device: session.data.profile.deviceLabel,
      status: "recorded",
      metadata: {
        mode: body.data.mode,
        withAi: body.data.withAi,
        messageLength: body.data.message.length,
        readOnly: true,
      },
    });
    const data = await runGarageProblemSolver({
      session: session.data,
      message: body.data.message,
      mode: body.data.mode,
      withAi: body.data.withAi,
    });
    return ok(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail(503, "PROBLEM_SOLVER_FAILED", "Investigasi belum dapat diselesaikan. Tidak ada data bisnis yang diubah.");
  }
}

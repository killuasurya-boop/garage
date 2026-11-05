import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  getProblemCase,
  linkCaseOperation,
  ProblemCaseError,
  recordCaseDecision,
  rerunProblemCase,
  verifyProblemCase,
} from "@/lib/ai-problem-cases";
import { runGarageProblemSolver } from "@/lib/garage-problem-solver-service";
import { rateLimit } from "@/lib/rate-limit";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rerun"), withAi: z.boolean().optional() }),
  z.object({ action: z.literal("verify") }),
  z.object({
    action: z.literal("decide"),
    decision: z.enum(["choose_option", "defer", "dismiss", "resolve", "reopen", "note"]),
    optionId: z.string().max(10).optional(),
    note: z.string().trim().max(500).optional(),
    expectedDiagnosisHash: hash,
  }),
  z.object({ action: z.literal("link_operation"), operationId: z.string().uuid() }),
]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  try {
    return ok(await getProblemCase(session.data, id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ProblemCaseError) return fail(error.status, error.code, error.message);
    throw error;
  }
}

/** Aksi kasus: analisis ulang, verifikasi hasil, keputusan Owner, tautkan pelaksanaan resmi. Tidak ada eksekusi di sini. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "ai-problem-cases", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    const input = body.data;
    if (input.action === "decide") {
      return ok(await recordCaseDecision(session.data, id, input));
    }
    if (input.action === "link_operation") {
      return ok(await linkCaseOperation(session.data, id, input.operationId));
    }
    const current = await getProblemCase(session.data, id);
    const result = await runGarageProblemSolver({
      session: session.data,
      message: current.question,
      mode: current.mode === "full" ? "full" : "quick",
      withAi: input.action === "rerun" ? input.withAi !== false : false,
    });
    if (input.action === "rerun") return ok(await rerunProblemCase(session.data, id, result));
    return ok(await verifyProblemCase(session.data, id, result));
  } catch (error) {
    if (error instanceof ProblemCaseError) return fail(error.status, error.code, error.message);
    console.error("[problem-cases] gagal", error);
    return fail(503, "PROBLEM_CASE_FAILED", "Aksi kasus belum dapat diselesaikan. Tidak ada data bisnis yang diubah.");
  }
}

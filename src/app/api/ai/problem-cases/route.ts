import { fail, ok } from "@/lib/api-response";
import { listProblemCases, ProblemCaseError, type CaseStatus } from "@/lib/ai-problem-cases";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set(["open", "monitoring", "resolved", "dismissed"]);

/** Daftar kasus AYA milik Owner (riwayat masalah & keputusan). */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const status = new URL(request.url).searchParams.get("status");
  try {
    return ok(await listProblemCases(session.data, { status: status && STATUSES.has(status) ? (status as CaseStatus) : undefined }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ProblemCaseError) return fail(error.status, error.code, error.message);
    throw error;
  }
}

import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { askAyaAboutApproval, decideFromDecisionCenter, DecisionCenterError, getDecisionDetail } from "@/lib/decision-center-server";
import { rateLimit } from "@/lib/rate-limit";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.enum(["approve", "reject", "defer", "request_revision", "clear"]),
      note: z.string().trim().max(500).optional(),
      expectedSnapshotHash: hash,
      challengeId: z.string().uuid().optional(),
      nonce: z.string().min(10).max(200).optional(),
      code: z.string().regex(/^\d{6}$/).optional(),
    })
    .refine((v) => v.action === "approve" || v.action === "clear" || (v.note && v.note.length >= 5), {
      message: "Alasan/catatan wajib minimal 5 karakter.",
      path: ["note"],
    }),
  z.object({ action: z.literal("ask"), question: z.string().trim().min(3).max(500) }),
]);

function failFrom(error: unknown) {
  if (error instanceof DecisionCenterError) return fail(error.status, error.code, error.message);
  console.error("[decision-center] gagal", error);
  return fail(503, "DECISION_CENTER_FAILED", "Permintaan belum dapat diproses. Tidak ada data yang diubah.");
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  try {
    return ok(await getDecisionDetail(session.data, id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failFrom(error);
  }
}

/** Setujui / Tolak (R3 = kode 2FA) / Tunda / Minta revisi / Tanya AYA. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "decision-center", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    if (body.data.action === "ask") return ok(await askAyaAboutApproval(session.data, id, body.data.question));
    return ok(await decideFromDecisionCenter(session.data, id, body.data));
  } catch (error) {
    return failFrom(error);
  }
}

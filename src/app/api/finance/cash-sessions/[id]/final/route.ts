import { z } from "zod";

import { accountabilityFailure } from "@/lib/accountability-route";
import { fail, ok, readJson } from "@/lib/api-response";
import { decideFinalApproval, getFinalApprovalPreview } from "@/lib/cash-final-approval";
import { rateLimit } from "@/lib/rate-limit";
import { requireOwnerOrManager } from "@/lib/server-auth";
import { StepUpError } from "@/lib/step-up-totp";

export const runtime = "nodejs";

// B4 (PRD §13): final closing hanya Owner (dicek di service) + TOTP terikat ringkasan.
const decideSchema = z.object({
  decision: z.enum(["approve", "approve_with_exception", "return"]),
  note: z.string().trim().max(1000).optional(),
  challengeId: z.string().uuid(),
  nonce: z.string().min(16).max(200),
  code: z.string().trim().regex(/^\d{6}$/, "Kode 2FA harus 6 angka."),
});

function failure(error: unknown) {
  if (error instanceof StepUpError) return fail(error.status, error.code, error.message);
  return accountabilityFailure(error);
}

/** Ringkasan shift + tantangan 2FA (sekali pakai, 5 menit). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "cash-session-final-preview", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  try {
    return ok(await getFinalApprovalPreview(id, session.data));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  // Batasi tebakan kode 2FA.
  const limited = rateLimit(request, "cash-session-final-decide", { limit: 6, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const body = await readJson(request, decideSchema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    return ok(await decideFinalApproval(id, body.data, session.data));
  } catch (error) {
    return failure(error);
  }
}

import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { RECRUITMENT_STATUSES, updateCandidate } from "@/lib/garage-recruitment-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateCandidateSchema = z.object({
  status: z.enum([...RECRUITMENT_STATUSES] as [string, ...string[]]).optional(),
  score: z.number().int().min(1).max(10).optional().nullable(),
  notes: z.string().optional().nullable(),
  followUpDate: z.string().optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  finalDecision: z.string().optional().nullable(),
  interviewDate: z.string().optional().nullable(),
  interviewLink: z.string().optional().nullable(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Admin",
    "Manager Operasional",
  ]);
  if (session.response) return session.response;

  const { id } = await context.params;
  const idResult = z.string().uuid().safeParse(id);
  if (!idResult.success) {
    return fail(400, "INVALID_CANDIDATE_ID", "Candidate ID tidak valid.");
  }

  const body = await readJson(request, updateCandidateSchema);
  if (body.error) return body.error;

  const updated = await updateCandidate(idResult.data, body.data);
  if (!updated) {
    return fail(404, "CANDIDATE_NOT_FOUND", "Kandidat tidak ditemukan.");
  }

  return ok({ candidate: updated });
}

// Keputusan pengajuan akses staf (I3). Route menerima Owner & Manajer supaya
// percobaan Manajer sampai ke service: ditolak 403 DAN tercatat di audit (AC-I07).
import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { MANAGEMENT_ROLES } from "@/lib/role-access";
import { requireGarageSession } from "@/lib/server-auth";
import { APPROVABLE_ROLES, decideAccessRequest, StaffAccessError } from "@/lib/staff-access";

export const runtime = "nodejs";

const reason = z.string().trim().min(3).max(500);
const schema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("approve"),
    role: z.enum(APPROVABLE_ROLES),
    outletId: z.string().uuid(),
    position: z.string().trim().max(80).nullable().optional(),
    workstation: z.string().trim().max(20).nullable().optional(),
    reason,
  }),
  z.object({ decision: z.literal("reject"), reason }),
  z.object({ decision: z.literal("request_info"), reason }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    return ok(await decideAccessRequest(id, body.data, session.data));
  } catch (error) {
    if (error instanceof StaffAccessError) return fail(error.status, error.code, error.message);
    throw error;
  }
}

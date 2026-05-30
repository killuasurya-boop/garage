import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { decideApproval, getApprovalById } from "@/lib/garage-service";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const approvalSchema = z
  .object({
    status: z.enum(["approved", "rejected"]),
    reasonDecided: z.string().trim().max(500).optional(),
  })
  .refine(
    (data) =>
      data.status !== "rejected" ||
      (data.reasonDecided && data.reasonDecided.length >= 5),
    {
      message: "Alasan reject wajib diisi minimal 5 karakter.",
      path: ["reasonDecided"],
    },
  );

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireGarageSession();
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const approval = await getApprovalById(id);
  if (!approval) {
    return fail(404, "APPROVAL_NOT_FOUND", "Approval tidak ditemukan.");
  }
  return ok(approval);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("approvals:decide");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, approvalSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  try {
    const approval = await decideApproval(
      id,
      {
        status: body.data.status,
        reasonDecided: body.data.reasonDecided,
      },
      session.data,
    );
    if (!approval) {
      return fail(404, "APPROVAL_NOT_FOUND", "Approval tidak ditemukan.");
    }
    return ok(approval);
  } catch (err) {
    return fail(
      400,
      "APPROVAL_DECIDE_FAILED",
      err instanceof Error ? err.message : "Gagal mencatat keputusan.",
    );
  }
}

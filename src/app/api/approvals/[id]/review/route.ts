import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { reviewApproval } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Smart Approval V3: Tunda / Minta bukti-revisi / hapus tanda. Tidak mengubah uang atau stok.
const schema = z.object({
  action: z.enum(["defer", "request_revision", "clear"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("approvals:decide");
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    const approval = await reviewApproval(id, body.data, session.data);
    if (!approval) return fail(404, "APPROVAL_NOT_FOUND", "Pengajuan tidak ditemukan.");
    return ok(approval);
  } catch (error) {
    return fail(400, "APPROVAL_REVIEW_FAILED", error instanceof Error ? error.message : "Gagal menyimpan.");
  }
}

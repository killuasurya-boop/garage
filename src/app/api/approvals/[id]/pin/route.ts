import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { ApprovalPolicyError, decideApprovalWithPin } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const pinDecisionSchema = z
  .object({
    pin: z.string().trim().regex(/^\d{4,8}$/, "PIN harus 4–8 digit angka."),
    status: z.enum(["approved", "rejected"]),
    reasonDecided: z.string().trim().max(500).optional(),
  })
  .refine(
    (data) =>
      data.status !== "rejected" || (data.reasonDecided && data.reasonDecided.length >= 5),
    { message: "Alasan menolak wajib diisi minimal 5 karakter.", path: ["reasonDecided"] },
  );

/**
 * Manajer/Owner memutus pengajuan langsung di tablet kasir dengan PIN-nya.
 * Session yang login cukup kasir; identitas pemutus diambil dari PIN.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "approval-pin", { limit: 15, windowMs: 60_000 });
  if (limited) return limited;

  const session = await requirePermission("orders:manage");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, pinDecisionSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  try {
    const approval = await decideApprovalWithPin(id, body.data, session.data);
    if (!approval) {
      return fail(404, "APPROVAL_NOT_FOUND", "Pengajuan tidak ditemukan.");
    }
    return ok(approval);
  } catch (error) {
    if (error instanceof ApprovalPolicyError) return fail(403, error.code, error.message);
    return fail(
      400,
      "APPROVAL_PIN_FAILED",
      error instanceof Error ? error.message : "Gagal memutus pengajuan dengan PIN.",
    );
  }
}

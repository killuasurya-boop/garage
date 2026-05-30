import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { decideApprovalsBulk } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const bulkSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(100),
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

export async function POST(request: Request) {
  const session = await requirePermission("approvals:decide");
  if (session.response) return session.response;

  const body = await readJson(request, bulkSchema);
  if (body.error) return body.error;

  const result = await decideApprovalsBulk(
    body.data.ids,
    { status: body.data.status, reasonDecided: body.data.reasonDecided },
    session.data,
  );
  return ok(result);
}

import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { decideInventoryTransferRequest } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function canIssueTransfer(role: string) {
  return role === "Owner / CEO" || role === "Admin" || role === "Gudang";
}

const issueSchema = z
  .object({
    items: z
      .array(
        z.object({
          itemId: z.string().uuid(),
          issuedQty: z.number().nonnegative(),
        }),
      )
      .optional(),
  })
  .optional();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  if (!canIssueTransfer(session.data.profile.role)) {
    return fail(403, "FORBIDDEN", "Hanya Owner/Admin/Gudang yang bisa issue request Gudang.");
  }
  const { id } = await context.params;
  let payload: z.infer<typeof issueSchema> = undefined;
  try {
    const text = await request.text();
    payload = text.trim() ? issueSchema.parse(JSON.parse(text)) : undefined;
  } catch (error) {
    return fail(
      400,
      "VALIDATION_ERROR",
      error instanceof Error ? error.message : "Payload issue tidak valid.",
    );
  }
  try {
    const result = await decideInventoryTransferRequest(id, "issue", session.data, payload);
    return result ? ok(result) : fail(404, "TRANSFER_NOT_FOUND", "Request tidak ditemukan.");
  } catch (error) {
    return fail(400, "TRANSFER_ISSUE_FAILED", error instanceof Error ? error.message : "Issue gagal.");
  }
}

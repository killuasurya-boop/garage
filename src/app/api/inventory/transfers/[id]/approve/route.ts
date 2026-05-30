import { fail, ok } from "@/lib/api-response";
import { decideInventoryTransferRequest } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function canDecideTransfer(role: string) {
  return role === "Owner / CEO" || role === "Admin" || role === "Gudang";
}

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  if (!canDecideTransfer(session.data.profile.role)) {
    return fail(403, "FORBIDDEN", "Hanya Owner/Admin/Gudang yang bisa approve request Gudang.");
  }
  const { id } = await context.params;
  try {
    const result = await decideInventoryTransferRequest(id, "approve", session.data);
    return result ? ok(result) : fail(404, "TRANSFER_NOT_FOUND", "Request tidak ditemukan.");
  } catch (error) {
    return fail(400, "TRANSFER_APPROVE_FAILED", error instanceof Error ? error.message : "Approve gagal.");
  }
}

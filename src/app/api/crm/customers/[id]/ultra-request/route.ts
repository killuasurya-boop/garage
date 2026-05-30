import { fail, ok } from "@/lib/api-response";
import { markCustomerUltraCandidate } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("crm:write");
  if (session.response) return session.response;

  const { id } = await context.params;
  const updated = await markCustomerUltraCandidate(id);
  if (!updated) {
    return fail(404, "CUSTOMER_NOT_FOUND", "Customer tidak ditemukan.");
  }

  return ok({ ultraCandidate: true });
}

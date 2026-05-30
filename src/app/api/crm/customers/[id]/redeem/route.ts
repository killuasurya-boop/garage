import { redeemCustomerPoints } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";
import { ok } from "@/lib/api-response";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("crm:write");
  if (session.response) return session.response;
  const { id } = await params;
  const result = await redeemCustomerPoints(id);
  if (!result) return new Response("Customer not found", { status: 404 });
  return ok(result);
}
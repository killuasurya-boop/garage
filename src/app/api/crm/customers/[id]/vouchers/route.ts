import { getCustomerVouchers } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";
import { ok } from "@/lib/api-response";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("crm:read");
  if (session.response) return session.response;
  const { id } = await params;
  const vouchers = await getCustomerVouchers(id);
  return ok({ vouchers });
}
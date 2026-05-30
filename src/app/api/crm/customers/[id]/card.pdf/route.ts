import { fail } from "@/lib/api-response";
import { getCustomerDetailForCrm } from "@/lib/garage-service";
import { generateMembershipCardPdf } from "@/lib/membership-card-pdf";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("crm:read");
  if (session.response) return session.response;

  const { id } = await context.params;
  const customer = await getCustomerDetailForCrm(id);
  if (!customer) {
    return fail(404, "CUSTOMER_NOT_FOUND", "Customer tidak ditemukan.");
  }

  const pdf = await generateMembershipCardPdf({
    name: customer.name,
    phone: customer.phone,
    tier: customer.cardTier ?? customer.tier,
    memberCode: customer.memberCode,
    membershipSince: customer.membershipSince,
    expiresAt: customer.expiresAt ?? null,
    ultraCandidate: customer.ultraCandidate,
  });
  const filename = `garage-member-card-${customer.memberCode ?? customer.phone}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

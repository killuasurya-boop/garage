import { fail } from "@/lib/api-response";
import { getCustomerDetailForCrm } from "@/lib/garage-service";
import { generateMembershipCardImage } from "@/lib/membership-card-image";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function parseSide(value: string | null): "front" | "back" {
  return value === "back" ? "back" : "front";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("crm:read");
  if (session.response) return session.response;

  const { id } = await context.params;
  const customer = await getCustomerDetailForCrm(id);
  if (!customer) {
    return fail(404, "CUSTOMER_NOT_FOUND", "Customer tidak ditemukan.");
  }

  const url = new URL(request.url);
  const side = parseSide(url.searchParams.get("side"));

  const image = await generateMembershipCardImage(
    {
      name: customer.name,
      phone: customer.phone,
      tier: customer.cardTier ?? customer.tier,
      memberCode: customer.memberCode,
      address: customer.address ?? null,
      membershipSince: customer.membershipSince,
      expiresAt: customer.expiresAt ?? null,
    },
    { format: "png", side },
  );

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="garage-member-${customer.memberCode ?? customer.phone}-${side}.png"`,
      "Cache-Control": "no-store",
    },
  });
}

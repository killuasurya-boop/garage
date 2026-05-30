import { requireMemberAuth } from "@/lib/member-auth";
import { getMemberProfile } from "@/lib/member-service";
import { errorJson } from "@/lib/member-types";
import { generateMembershipCardPdf } from "@/lib/membership-card-pdf";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireMemberAuth(request);
  if (session.response) return session.response;

  const member = await getMemberProfile(session.data.customer.id);
  if (!member) return errorJson(404, "Member tidak ditemukan.");

  const pdf = await generateMembershipCardPdf({
    name: member.name,
    phone: member.phone,
    tier: member.cardTier ?? member.level,
    memberCode: member.memberCode,
    membershipSince: member.membershipSince,
    expiresAt: member.expiresAt ?? null,
    ultraCandidate: member.ultraCandidate,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="garage-member-card-${member.memberCode ?? member.phone}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

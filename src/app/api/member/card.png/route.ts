import { requireMemberAuth } from "@/lib/member-auth";
import { getMemberProfile } from "@/lib/member-service";
import { errorJson } from "@/lib/member-types";
import { generateMembershipCardImage } from "@/lib/membership-card-image";

export const runtime = "nodejs";

function parseSide(value: string | null): "front" | "back" {
  return value === "back" ? "back" : "front";
}

export async function GET(request: Request) {
  const session = await requireMemberAuth(request);
  if (session.response) return session.response;

  const member = await getMemberProfile(session.data.customer.id);
  if (!member) return errorJson(404, "Member tidak ditemukan.");

  const url = new URL(request.url);
  const side = parseSide(url.searchParams.get("side"));

  const image = await generateMembershipCardImage(
    {
      name: member.name,
      phone: member.phone,
      tier: member.cardTier ?? member.level,
      memberCode: member.memberCode,
      address: member.address ?? null,
      membershipSince: member.membershipSince,
      expiresAt: member.expiresAt ?? null,
    },
    { format: "png", side },
  );

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="garage-member-${member.memberCode ?? member.phone}-${side}.png"`,
      "Cache-Control": "no-store",
    },
  });
}

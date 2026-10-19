import { buildEventIcs, icsResponse } from "@/lib/event-calendar";
import { getPublicInvitation, invitationUrl } from "@/lib/event-invitations";

export const dynamic = "force-dynamic";

/** File .ics dari undangan pribadi (berlaku juga saat event masih Draft). */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getPublicInvitation(token).catch(() => null);
  if (!invitation) return new Response("Not found", { status: 404 });
  return icsResponse(buildEventIcs(invitation.event, invitationUrl(token)), "undangan-grand-opening-garage-coffee.ics");
}

import { clearPartnerSessionCookie, requirePartnerSession } from "@/lib/partner-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requirePartnerSession(request, { allowPinChangePending: true });
  const response = Response.json({ data: { loggedOut: true } });
  response.headers.append("Set-Cookie", clearPartnerSessionCookie(request));
  // Sesi yang sudah tidak berlaku tetap dibersihkan cookie-nya.
  void session;
  return response;
}

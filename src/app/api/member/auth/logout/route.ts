import {
  clearMemberCookieHeaders,
  readRefreshToken,
  revokeRefreshToken,
} from "@/lib/member-auth";
import { successJson } from "@/lib/member-types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await revokeRefreshToken(readRefreshToken(request));

  const headers = new Headers();
  for (const cookie of clearMemberCookieHeaders()) {
    headers.append("Set-Cookie", cookie);
  }

  return successJson({ loggedOut: true }, { headers });
}

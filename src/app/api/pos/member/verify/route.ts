import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { lookupMemberByQr } from "@/lib/member-service";
import { isPhoneLikeMemberIdentifier, issueMemberRedeemToken } from "@/lib/member-redeem-token";
import { rateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const verifySchema = z.object({
  qr: z.string().min(1, "QR payload wajib diisi."),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "pos-member-verify", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const session = await requirePermission("pos:use");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, verifySchema);
  if (body.error) {
    return body.error;
  }

  if (isPhoneLikeMemberIdentifier(body.data.qr)) {
    return fail(400, "MEMBER_QR_REQUIRED", "Scan QR di kartu member (aplikasi member), bukan nomor HP.");
  }

  const result = await lookupMemberByQr(body.data.qr);
  if (!result.data) {
    return fail(404, "MEMBER_NOT_FOUND", result.error ?? "QR tidak dikenali.");
  }

  // Token pakai poin: terikat ke member ini + kasir yang memindai.
  const redeem = issueMemberRedeemToken({ customerId: result.data.customerId, userId: session.data.user.id });
  return ok({
    verified: true,
    scannedAt: new Date().toISOString(),
    redeemToken: redeem.token,
    redeemTokenExpiresAt: redeem.expiresAt,
    customerId: result.data.customerId,
    member: result.data.member,
  });
}

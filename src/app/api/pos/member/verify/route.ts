import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { lookupMemberByQr } from "@/lib/member-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const verifySchema = z.object({
  qr: z.string().min(1, "QR payload wajib diisi."),
});

export async function POST(request: Request) {
  const session = await requirePermission("pos:use");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, verifySchema);
  if (body.error) {
    return body.error;
  }

  const result = await lookupMemberByQr(body.data.qr);
  if (!result.data) {
    return fail(404, "MEMBER_NOT_FOUND", result.error ?? "QR tidak dikenali.");
  }

  return ok({
    verified: true,
    scannedAt: new Date().toISOString(),
    customerId: result.data.customerId,
    member: result.data.member,
  });
}

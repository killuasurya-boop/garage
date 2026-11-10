import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createAuditLog } from "@/lib/garage-service";
import { MemberOtpError, issueCashierClaimCode } from "@/lib/member-otp";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ customerId: z.string().uuid("ID pelanggan tidak valid.") });

// Kasir membuat kode klaim member online untuk pelanggan yang hadir di kasir (pengganti OTP WhatsApp).
// Kode hanya tampil sekali di layar kasir; audit tidak menyimpan kodenya.
export async function POST(request: Request) {
  const session = await requirePermission("pos:use");
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  try {
    const result = await issueCashierClaimCode({ customerId: body.data.customerId });
    await createAuditLog({
      actor: `${session.data.user.name} / ${session.data.profile.role}`,
      action: "Member: kode klaim kasir dibuat",
      object: `${result.customerName} (${result.maskedPhone})`,
      device: "POS",
      metadata: { customerId: body.data.customerId, expiresAt: result.expiresAt },
    }).catch(() => null);
    return ok({ code: result.code, expiresAt: result.expiresAt, maskedPhone: result.maskedPhone });
  } catch (error) {
    if (error instanceof MemberOtpError) return fail(error.status, error.code, error.message);
    throw error;
  }
}

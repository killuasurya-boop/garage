import { z } from "zod";

import { fail, readJson } from "@/lib/api-response";
import { StepUpError, verifyUserTotp } from "@/lib/step-up-totp";
import { approvePartnerSettlement, cancelPartnerSettlement, submitPartnerSettlement } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["submit", "approve", "cancel"]),
  reason: z.string().trim().max(300).optional(),
  totpCode: z.string().trim().regex(/^\d{6}$/, "Kode 2FA harus 6 angka.").optional(),
});

// Ajukan (kasir/Manajer) · Setujui (Owner) · Batalkan draft (Owner/Manajer). Role dicek ulang di service.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  if (body.data.action === "approve" && session.data.profile.role === "Owner") {
    // Persetujuan settlement = keputusan uang: Owner yang memakai 2FA wajib memasukkan kode authenticator.
    // Owner tanpa 2FA tetap bisa menyetujui (dicatat di jejak mitra oleh service seperti biasa).
    try {
      const valid = await verifyUserTotp(session.data.user.id, body.data.totpCode ?? "");
      if (!valid) {
        return body.data.totpCode
          ? fail(401, "TOTP_INVALID", "Kode 2FA salah atau kedaluwarsa. Coba kode terbaru.")
          : fail(428, "TOTP_REQUIRED", "Masukkan kode 2FA (authenticator) untuk menyetujui settlement.");
      }
    } catch (error) {
      if (!(error instanceof StepUpError) || error.code !== "TOTP_NOT_ENABLED") throw error;
    }
  }
  return partnerRoute(() => {
    if (body.data.action === "submit") return submitPartnerSettlement(id, session.data);
    if (body.data.action === "approve") return approvePartnerSettlement(id, session.data);
    return cancelPartnerSettlement(id, body.data.reason ?? "", session.data);
  });
}

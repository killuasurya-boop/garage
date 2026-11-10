import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { addPartnerBankAccount } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  bankName: z.string().trim().min(2).max(60),
  accountName: z.string().trim().min(2).max(120),
  accountNumber: z.string().trim().min(6).max(30),
});

// Rekening baru selalu "pending" sampai diverifikasi Owner (nomor lengkap tidak pernah dikirim ke kasir/mitra).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => addPartnerBankAccount(id, body.data, session.data), 201);
}

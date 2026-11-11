import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { recordPartnerPayout } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  amount: z.number().int().positive(),
  fundSource: z.enum(["bank_jago", "bank_bni", "external"]),
  reference: z.string().trim().min(4).max(80),
  paidAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  proofUrl: z.string().trim().max(500).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(100),
});

// Catat transfer ke mitra (di luar laci kasir). Manajer mencatat → Owner memverifikasi.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const paidAt = /^\d{4}-\d{2}-\d{2}$/.test(body.data.paidAt) ? new Date(`${body.data.paidAt}T12:00:00+07:00`) : new Date(body.data.paidAt);
  return partnerRoute(() => recordPartnerPayout(id, { ...body.data, paidAt }, session.data), 201);
}

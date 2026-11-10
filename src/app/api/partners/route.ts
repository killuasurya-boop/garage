import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { createPartner, listPartners } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const lastOrder = z.record(z.string().regex(/^[0-6]$/), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable()).optional();
const schema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9-]{2,16}$/, "Kode mitra 2–16 huruf/angka."),
  name: z.string().trim().min(2).max(120),
  picName: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  productKind: z.string().trim().max(120).nullable().optional(),
  handoverPoint: z.string().trim().max(200).nullable().optional(),
  lastOrderByDay: lastOrder,
  payoutSchedule: z.string().trim().max(200).nullable().optional(),
  terms: z.string().trim().max(2000).nullable().optional(),
});

// Smart Partner Hub: daftar & registrasi mitra resmi (Owner/Manajer).
export async function GET() {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  return partnerRoute(() => listPartners(session.data));
}

export async function POST(request: Request) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => createPartner(body.data, session.data), 201);
}

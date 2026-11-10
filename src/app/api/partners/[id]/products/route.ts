import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { createPartnerProduct, listPartnerProducts } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9-]{3,20}$/, "Kode produk 3–20 huruf/angka."),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  variants: z
    .array(
      z.object({
        variantId: z.string().trim().regex(/^[a-z0-9-]{1,30}$/),
        label: z.string().trim().min(1).max(60),
        unitCost: z.number().int().min(0),
        sellPrice: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(10),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  return partnerRoute(() => listPartnerProducts(id, { outletId: session.data.profile.outlet.id, showCost: true }));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => createPartnerProduct(id, body.data, session.data), 201);
}

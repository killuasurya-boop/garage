import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { convertPartnerApplication } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9]{2,8}$/, "Kode mitra 2–8 huruf/angka."),
  margin: z.number().int().min(0).max(1_000_000),
  category: z.string().trim().min(2).max(60),
});

// Jadikan pendaftar → mitra DRAFT + produk usulan NONAKTIF (Owner). Aktivasi tetap lewat alur Kelola Mitra.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => convertPartnerApplication(id, body.data, session.data), 201);
}

import { readJson } from "@/lib/api-response";
import { requirePartnerSession } from "@/lib/partner-auth";
import { submitPartnerProductByPartner } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { partnerSubmissionSchema } from "@/lib/partner-product-submission-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Portal Mitra: mitra mengajukan produk baru sendiri (partner_id dari sesi). Produk NONAKTIF sampai Owner menyetujui.
export async function POST(request: Request) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const body = await readJson(request, partnerSubmissionSchema);
  if (body.error) return body.error;
  return partnerRoute(() => submitPartnerProductByPartner(session.data, body.data), 201);
}

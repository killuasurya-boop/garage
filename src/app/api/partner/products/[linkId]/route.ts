import { readJson } from "@/lib/api-response";
import { requirePartnerSession } from "@/lib/partner-auth";
import { updatePartnerProductSubmission, withdrawPartnerProductSubmission } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { partnerSubmissionSchema } from "@/lib/partner-product-submission-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Portal Mitra: perbaiki pengajuan produk yang belum disetujui (kembali "menunggu persetujuan").
export async function PATCH(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const { linkId } = await context.params;
  const body = await readJson(request, partnerSubmissionSchema);
  if (body.error) return body.error;
  return partnerRoute(() => updatePartnerProductSubmission(session.data, linkId, body.data));
}

// Portal Mitra: tarik pengajuan yang belum disetujui (data disimpan untuk audit, produk disembunyikan).
export async function DELETE(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const { linkId } = await context.params;
  return partnerRoute(() => withdrawPartnerProductSubmission(session.data, linkId));
}

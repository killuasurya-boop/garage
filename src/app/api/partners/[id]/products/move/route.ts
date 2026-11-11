import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { movePartnerProducts } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  toPartnerId: z.string().uuid(),
  reason: z.string().trim().min(3, "Alasan pemindahan wajib diisi.").max(300),
  // Tidak dikirim = semua produk mitra asal. UI selalu mengirim daftar yang dilihat Owner.
  linkIds: z.array(z.string().uuid()).min(1, "Pilih minimal satu produk untuk dipindah.").max(500).optional(),
});

// Pindahkan semua/sebagian produk mitra ke mitra lain sekaligus (service menolak selain Owner).
// Pesanan, tiket & setoran lama tetap milik mitra asal.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => movePartnerProducts(id, body.data, session.data));
}

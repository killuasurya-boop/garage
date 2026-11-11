import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { PartnerHubError, submitPartnerApplication } from "@/lib/partner-hub-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const rupiah = z.number().int().min(500, "Harga minimal Rp500.").max(10_000_000);
const schema = z.object({
  businessName: z.string().trim().min(2, "Nama usaha wajib diisi.").max(120),
  ownerName: z.string().trim().min(2, "Nama pemilik wajib diisi.").max(120),
  whatsapp: z.string().trim().regex(/^[0-9+\s-]{9,20}$/, "Nomor WhatsApp tidak valid."),
  email: z.string().trim().email("Format email tidak valid.").max(160).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  productKind: z.string().trim().min(2, "Jenis produk wajib diisi.").max(120),
  instagram: z.string().trim().max(120).refine((v) => !/^[a-z][a-z0-9+.-]*:/i.test(v) || /^https:\/\//i.test(v), "Instagram: @username atau tautan https.").optional().or(z.literal("")),
  legality: z.array(z.enum(["NIB", "PIRT", "Halal", "BPOM"])).max(4).optional(),
  products: z
    .array(
      z.object({
        name: z.string().trim().min(2, "Nama produk wajib diisi.").max(120),
        offerPrice: rupiah,
        suggestedPrice: rupiah.nullable().optional(),
        note: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .min(1, "Isi minimal satu produk yang ditawarkan.")
    .max(30, "Maksimal 30 produk per pendaftaran."),
  deliveryMode: z.enum(["antar_ke_garage", "dibuat_di_garage", "diambil_garage"]).optional().or(z.literal("")),
  operatingHours: z.string().trim().max(160).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  consent: z.literal(true, { message: "Setujui pemrosesan data untuk keperluan kerja sama." }),
  // Honeypot: kolom tersembunyi yang hanya diisi bot.
  website: z.string().max(0).optional().or(z.literal("")),
});

// Publik: formulir "Jadi Mitra Garage" (halaman /mitra). Rate limit per IP + honeypot + satu pendaftaran aktif per nomor WA.
export async function POST(request: Request) {
  const limited = rateLimit(request, "partner-application", { limit: 5, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  try {
    const row = await submitPartnerApplication({
      ...body.data,
      legality: body.data.legality ?? [],
      deliveryMode: body.data.deliveryMode || null,
    });
    return ok({ applicationNo: row.applicationNo }, { status: 201 });
  } catch (error) {
    if (error instanceof PartnerHubError) return fail(error.status, error.code, error.message);
    return fail(503, "APPLICATION_UNAVAILABLE", "Pendaftaran belum bisa disimpan. Coba lagi beberapa saat lagi atau hubungi kami lewat WhatsApp.");
  }
}

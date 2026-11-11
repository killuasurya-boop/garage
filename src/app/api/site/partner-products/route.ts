import { ok } from "@/lib/api-response";
import { publicPartnerMarketingProducts } from "@/lib/partner-hub-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Media marketing halaman utama: produk mitra pilihan Owner yang memenuhi syarat. Tanpa HPP/kontak mitra.
export async function GET(request: Request) {
  const limited = rateLimit(request, "site-partner-products", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  try {
    return ok({ products: await publicPartnerMarketingProducts() });
  } catch (error) {
    console.error("[site/partner-products]", error);
    return ok({ products: [] });
  }
}

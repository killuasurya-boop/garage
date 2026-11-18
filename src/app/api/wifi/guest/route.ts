import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { WifiError, grantGuestWifi } from "@/lib/wifi-hotspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2).max(60),
  phone: z.string().trim().min(8).max(20),
  mac: z.string().max(40).optional().nullable(),
  ip: z.string().max(40).optional().nullable(),
  loginUrl: z.string().max(300),
});

// Masuk cepat WiFi tamu (Owner 18 Nov 2026): nama + WhatsApp → kredensial hotspot tamu hari ini (sesi pendek).
// Publik: pelanggan belum punya internet/akun. Dijaga rate limit, validasi nomor, dan loginUrl hanya ke router lokal.
export async function POST(request: Request) {
  // Semua pelanggan hotspot keluar lewat satu IP outlet → batas per IP longgar, ditambah batas per nomor.
  const limited = rateLimit(request, "wifi-guest", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const perPhone = rateLimit(request, `wifi-guest-phone:${body.data.phone.replace(/\D/g, "").slice(-10)}`, { limit: 6, windowMs: 10 * 60_000 });
  if (perPhone) return perPhone;
  try {
    const grant = await grantGuestWifi(body.data);
    return ok(grant, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof WifiError) return fail(error.status, error.code, error.message);
    console.error("WiFi guest access failed", error);
    return fail(500, "WIFI_ACCESS_FAILED", "WiFi gagal diaktifkan. Coba lagi.");
  }
}

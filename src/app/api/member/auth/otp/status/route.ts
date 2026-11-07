import { getMemberOtpConfig } from "@/lib/member-otp";
import { successJson } from "@/lib/member-types";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Apakah verifikasi OTP WhatsApp aktif? UI hanya menampilkan langkah OTP bila provider nyata
// terkonfigurasi (kontrak member #13). Tidak membocorkan nama env yang kurang.
export async function GET(request: Request) {
  const limited = rateLimit(request, "member-otp-status", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const config = await getMemberOtpConfig();
  return successJson({ enabled: config.enabled, devEcho: config.mode === "dev_echo" });
}

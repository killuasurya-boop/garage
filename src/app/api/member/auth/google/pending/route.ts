import { parseCookies } from "@/lib/member-auth";
import { GOOGLE_PENDING_COOKIE, openPendingProfile } from "@/lib/member-google-oauth";
import { errorJson, successJson } from "@/lib/member-types";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Data Google untuk form "lengkapi profil" (nama, email, foto) — hanya dari cookie bertanda tangan milik browser ini.
export async function GET(request: Request) {
  const limited = rateLimit(request, "member-google-pending", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const pending = openPendingProfile(parseCookies(request)[GOOGLE_PENDING_COOKIE]);
  if (!pending) return errorJson(404, "Sesi Google sudah habis. Ulangi Lanjutkan dengan Google.");
  return successJson({ email: pending.email, name: pending.name, picture: pending.picture, next: pending.next });
}

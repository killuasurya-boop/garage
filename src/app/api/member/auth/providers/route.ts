import { googleConfig } from "@/lib/member-google-oauth";
import { successJson } from "@/lib/member-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Metode login member yang benar-benar aktif (tombol Google hanya tampil bila Client ID terpasang).
export async function GET() {
  return successJson({ google: Boolean(googleConfig()) });
}

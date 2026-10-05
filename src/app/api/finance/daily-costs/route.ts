import { fail, ok } from "@/lib/api-response";
import { getDailyCosts } from "@/lib/finance-daily-costs";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Biaya harian: tetap (master Owner) + tidak tetap otomatis dari bahan baku
// terpakai (Bar/Dapur) + daftar belanja stok habis/menipis.
export async function GET(request: Request) {
  const session = await requirePermission("finance:read");
  if (session.response) return session.response;

  const date = new URL(request.url).searchParams.get("date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return fail(400, "VALIDATION_ERROR", "Format tanggal harus YYYY-MM-DD.");
  }
  return ok(await getDailyCosts(date ?? undefined));
}

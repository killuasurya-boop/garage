import { ok } from "@/lib/api-response";
import { getRecruitmentStats, listCandidates } from "@/lib/garage-recruitment-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daftar kandidat + statistik untuk admin/HR/CEO. Data tidak boleh publik.
export async function GET(request: Request) {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Admin",
    "Manager Operasional",
  ]);
  if (session.response) return session.response;

  const url = new URL(request.url);
  const page = Math.max(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25, 1), 100);

  const [result, stats] = await Promise.all([
    listCandidates({
      status: url.searchParams.get("status") ?? undefined,
      position: url.searchParams.get("position") ?? undefined,
      location: url.searchParams.get("location") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      page,
      pageSize,
    }),
    getRecruitmentStats(),
  ]);

  return ok({ items: result.items, total: result.total, page: result.page, pageSize: result.pageSize, totalPages: result.totalPages, stats });
}


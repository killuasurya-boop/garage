import { ok } from "@/lib/api-response";
import { getRecruitmentStats, getRecruitmentAnalytics } from "@/lib/garage-recruitment-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Analytics rekrutmen — dilindungi auth. Hanya Owner/Manajer.
export async function GET() {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;

  const [stats, analytics] = await Promise.all([
    getRecruitmentStats(),
    getRecruitmentAnalytics(),
  ]);

  return ok({ stats, analytics });
}

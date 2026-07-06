import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { getFeePoolDetail } from "@/lib/garage-fee-pool";

export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ date: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return fail(400, "INVALID_DATE", "Format tanggal harus YYYY-MM-DD.");
  }

  try {
    const detail = await getFeePoolDetail(date);
    return ok(detail);
  } catch (err) {
    return fail(500, "POOL_DETAIL_FAILED", (err as Error).message);
  }
}

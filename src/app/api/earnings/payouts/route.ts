import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  autoCreateEligiblePayouts,
  closeCycleForStaff,
  getCurrentCycle,
  listStaffEarningBalances,
  listPayouts,
  PayoutActiveError,
} from "@/lib/garage-earnings";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("earnings:manage");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const autoPayout = await autoCreateEligiblePayouts({
    outletId: session.data.profile.outlet.id,
    requestedBy: session.data.user.id,
  });
  const [rows, staffBalances] = await Promise.all([
    listPayouts({ status }),
    listStaffEarningBalances(),
  ]);
  return ok({ payouts: rows, staffBalances, currentCycle: getCurrentCycle(), autoPayout });
}

const closeCycleSchema = z.object({
  staffUserId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await requirePermission("earnings:manage");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, closeCycleSchema);
  if (body.error) return body.error;

  const cycle = getCurrentCycle();
  let payout: Awaited<ReturnType<typeof closeCycleForStaff>>;
  try {
    payout = await closeCycleForStaff({
      staffUserId: body.data.staffUserId,
      cycle,
      outletId: session.data.profile.outlet.id,
      requestedBy: session.data.user.id,
    });
  } catch (error) {
    if (error instanceof PayoutActiveError) {
      return fail(
        409,
        "PAYOUT_ACTIVE",
        "Staf masih punya pencairan yang belum selesai. Bayar atau batalkan dulu sebelum membuat yang baru.",
      );
    }
    throw error;
  }

  if (!payout) {
    return fail(
      400,
      "NO_AVAILABLE_BALANCE",
      "Saldo staff belum melewati lock 5 bulan, jadi belum bisa ditarik.",
    );
  }

  return ok({ payout });
}

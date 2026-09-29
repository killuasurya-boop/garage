import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { PERIOD_KEYS } from "@/lib/finance-control-core";
import { getScenarioBase, listScenarios, runScenario, saveScenario } from "@/lib/finance-intelligence";
import { canUseApi } from "@/lib/role-access";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pct = z.number().min(-100).max(500);

const schema = z.object({
  period: z.enum(PERIOD_KEYS).default("this_month"),
  params: z.object({
    revenuePct: pct.default(0),
    hppPct: pct.default(0),
    payrollPct: pct.default(0),
    advertisingPct: pct.default(0),
    expensePct: pct.default(0),
  }),
  /** Isi untuk menyimpan skenario; kosong = hanya hitung. */
  name: z.string().trim().min(2).max(80).optional(),
});

// GET: baseline aktual + daftar skenario tersimpan (PRD §38).
export async function GET(request: Request) {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }
  const raw = new URL(request.url).searchParams.get("period") ?? "this_month";
  const period = (PERIOD_KEYS as readonly string[]).includes(raw) ? (raw as (typeof PERIOD_KEYS)[number]) : "this_month";
  const [base, scenarios] = await Promise.all([getScenarioBase(period), listScenarios()]);
  return ok({ base, scenarios });
}

// POST: hitung skenario (tidak mengubah transaksi aktual); simpan bila ada nama.
export async function POST(request: Request) {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }
  const body = await readJson(request, schema);
  if (body.error) {
    return body.error;
  }
  try {
    if (body.data.name) {
      if (!canUseApi(session.data.profile.role, "finance:write")) {
        return fail(403, "FORBIDDEN", "Menyimpan skenario butuh akses finance:write.");
      }
      return ok(await saveScenario({ name: body.data.name, period: body.data.period, params: body.data.params }, session.data), {
        status: 201,
      });
    }
    return ok(await runScenario({ period: body.data.period, params: body.data.params }));
  } catch (error) {
    console.error("[finance/scenario]", error);
    return fail(500, "SCENARIO_ERROR", "Gagal menghitung skenario.");
  }
}

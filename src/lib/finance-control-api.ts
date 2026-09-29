import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { getFinanceControlDashboard, type FinanceControlDashboard } from "@/lib/finance-control";
import { PERIOD_KEYS } from "@/lib/finance-control-core";
import { requirePermission } from "@/lib/server-auth";

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.")
  .nullable()
  .optional();

const periodSchema = z.object({
  period: z.enum(PERIOD_KEYS).default("today"),
  from: dateKey,
  to: dateKey,
});

export function parseFinancePeriod(request: Request) {
  const url = new URL(request.url);
  const parsed = periodSchema.safeParse({
    period: url.searchParams.get("period") ?? undefined,
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (!parsed.success) {
    return {
      data: null,
      error: fail(400, "VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; ")),
    };
  }
  return { data: parsed.data, error: null };
}

/** Handler GET untuk endpoint turunan (profit-loss, cashflow, bep, capital-recovery). */
export function financeSectionHandler<T>(pickSection: (dashboard: FinanceControlDashboard) => T) {
  return async function GET(request: Request) {
    const session = await requirePermission("finance:read");
    if (session.response) {
      return session.response;
    }
    const period = parseFinancePeriod(request);
    if (period.error) {
      return period.error;
    }
    try {
      const dashboard = await getFinanceControlDashboard(period.data);
      return ok({ period: dashboard.period, generatedAt: dashboard.generatedAt, ...pickSection(dashboard) });
    } catch (error) {
      console.error("[finance/section]", error);
      return fail(500, "FINANCE_ENGINE_ERROR", "Gagal menghitung data keuangan.");
    }
  };
}

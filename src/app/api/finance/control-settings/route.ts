import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { getFinanceSettingsBundle, updateFinanceSettings } from "@/lib/finance-control";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.");
const rupiah = z.number().int().min(0).max(100_000_000_000);
const costClass = z.enum(["fixed", "variable", "semi_variable", "reserve"]);

const updateSchema = z.object({
  reason: z.string().trim().min(3, "Alasan perubahan wajib diisi (audit trail).").max(300),
  settings: z
    .object({
      businessStartDate: dateKey.optional(),
      openingCash: z.object({ amount: z.number().int().min(-100_000_000_000).max(100_000_000_000), date: dateKey, isSet: z.boolean() }).optional(),
      revenueTargetDaily: rupiah.nullable().optional(),
      expenseApprovalThreshold: z.number().int().min(1_000).max(1_000_000_000).optional(),
      expenseOwnerApprovalThreshold: z.number().int().min(1_000).max(1_000_000_000).optional(),
      capitalRecoveryMethod: z.enum(["net_profit", "operating_cashflow", "net_profit_after_reserve"]).optional(),
      variableBudget: z
        .object({ barMin: rupiah, barMax: rupiah, dapurMin: rupiah, dapurMax: rupiah })
        .refine((v) => v.barMin <= v.barMax && v.dapurMin <= v.dapurMax, "Anggaran minimal tidak boleh melebihi maksimal.")
        .optional(),
      thresholds: z
        .object({
          hppRatioMax: z.number().min(1).max(100),
          opexRatioMax: z.number().min(1).max(100),
          payrollRatioMax: z.number().min(1).max(100),
          cashRunwaySafeDays: z.number().int().min(1).max(365),
          cashRunwayWarnDays: z.number().int().min(0).max(365),
          cashVarianceTolerance: rupiah,
        })
        .partial()
        .optional(),
    })
    .optional(),
  costItems: z
    .array(
      z.object({
        code: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9_]+$/, "Kode hanya huruf/angka/underscore."),
        name: z.string().trim().min(2).max(80),
        dailyAmount: rupiah,
        costClass,
        treatment: z.enum(["accrue", "budget_only", "reserve"]),
        active: z.boolean(),
        sortOrder: z.number().int().default(0),
      }),
    )
    .max(60)
    .optional(),
  payrollPositions: z
    .array(
      z.object({
        position: z.string().trim().min(2).max(80),
        monthlySalary: rupiah,
        headcount: z.number().int().min(0).max(100),
        active: z.boolean(),
      }),
    )
    .max(100)
    .optional(),
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(80),
        groupKey: z.enum(["opex", "cogs_purchase", "payroll", "payroll_payout", "non_operating", "reserve", "non_pnl"]),
        costClass,
        costItemCode: z.string().trim().max(24).nullable(),
      }),
    )
    .max(200)
    .optional(),
  capital: z
    .array(
      z.object({
        date: dateKey,
        type: z.enum(["injection", "withdrawal"]),
        amount: z.number().int().positive().max(100_000_000_000),
        description: z.string().trim().max(200).default(""),
      }),
    )
    .max(200)
    .optional(),
});

export async function GET() {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }
  return ok(await getFinanceSettingsBundle());
}

// Master data finance hanya boleh diubah Owner (modal, saldo kas, BEP, payroll master).
export async function PUT(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) {
    return session.response;
  }
  const body = await readJson(request, updateSchema);
  if (body.error) {
    return body.error;
  }

  const current = await getFinanceSettingsBundle();
  const approvalLimit = body.data.settings?.expenseApprovalThreshold ?? current.settings.expenseApprovalThreshold;
  const ownerLimit = body.data.settings?.expenseOwnerApprovalThreshold ?? current.settings.expenseOwnerApprovalThreshold;
  if (ownerLimit < approvalLimit) {
    return fail(400, "INVALID_THRESHOLD", "Batas approval Owner harus ≥ batas approval expense.");
  }

  const codes = body.data.costItems?.map((item) => item.code.toUpperCase()) ?? [];
  if (new Set(codes).size !== codes.length) {
    return fail(400, "DUPLICATE_CODE", "Kode biaya harus unik.");
  }
  const names = body.data.categories?.map((row) => row.name.toLowerCase()) ?? [];
  if (new Set(names).size !== names.length) {
    return fail(400, "DUPLICATE_CATEGORY", "Nama kategori expense harus unik.");
  }

  return ok(await updateFinanceSettings(body.data, session.data));
}

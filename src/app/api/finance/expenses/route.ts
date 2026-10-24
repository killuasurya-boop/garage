import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { ClosingError } from "@/lib/finance-closing";
import { EXPENSE_CASH_SOURCES } from "@/lib/cash-ledger";
import { createExpense, ExpenseCashSourceError, listExpenses } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const expenseSchema = z.object({
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(180),
  amount: z.number().int().positive(),
  paymentMethod: z.string().trim().min(2).max(60).optional(),
  // Biaya tunai: sumber dananya (buku kas). Wajib bila tidak punya shift sendiri.
  cashSource: z.enum(EXPENSE_CASH_SOURCES).nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  supplierInvoiceId: z.string().uuid().nullable().optional(),
  expenseDate: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(500).optional(),
  countAsPurchase: z.boolean().optional(),
});

export async function GET(request: Request) {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const data = await listExpenses(
    {
      category: url.searchParams.get("category") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    },
    session.data,
  );
  return ok({ expenses: data });
}

export async function POST(request: Request) {
  const session = await requirePermission("finance:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, expenseSchema);
  if (body.error) {
    return body.error;
  }

  try {
    return ok(await createExpense(body.data, session.data), { status: 201 });
  } catch (error) {
    if (error instanceof ClosingError) {
      return fail(409, error.code, error.message);
    }
    if (error instanceof ExpenseCashSourceError) {
      return fail(400, error.code, error.message);
    }
    throw error;
  }
}

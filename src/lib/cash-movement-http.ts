import { z } from "zod";

import { fail } from "@/lib/api-response";
import {
  type CashMovementFilters,
  CashMovementError,
  CashMovementPinRequiredError,
  CashSessionRequiredForCashOutError,
} from "@/lib/garage-service";

// Kas Keluar / Masuk Laci — skema body & pemetaan error bersama route handler.

const optionalText = (max: number) => z.string().trim().max(max).nullish();

export const cashMovementBodySchema = z.object({
  type: z.enum(["out", "in"]),
  categoryKey: z.string().trim().min(2).max(40).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().min(3, "Deskripsi wajib diisi (min. 3 huruf).").max(180),
  amount: z.number().int("Nominal harus angka bulat.").positive("Nominal harus lebih dari 0.").max(100_000_000),
  note: optionalText(300),
  counterparty: optionalText(120),
  vendorName: optionalText(80),
  receiptNo: optionalText(60),
  orderRef: optionalText(60),
  employeeUserId: optionalText(80),
  relatedRef: optionalText(40),
  // Alias dari klien lama / laporan akuntabilitas shift.
  referenceNo: optionalText(80),
  orderNo: optionalText(60),
  countAsPurchase: z.boolean().optional(),
});

export function cashMovementErrorResponse(error: unknown) {
  if (error instanceof CashMovementPinRequiredError) return fail(422, error.code, error.message);
  if (error instanceof CashMovementError) return fail(error.status, error.code, error.message);
  if (error instanceof CashSessionRequiredForCashOutError) return fail(409, "CASH_SESSION_REQUIRED", error.message);
  if (error instanceof Error && /^PIN salah|Terlalu banyak|terkunci/i.test(error.message)) {
    return fail(403, "MANAGER_PIN_INVALID", error.message);
  }
  if (error instanceof Error && /^Hanya Owner atau Manajer/.test(error.message)) {
    return fail(403, "FORBIDDEN", error.message);
  }
  if (error instanceof Error && error.name === "ClosingError") return fail(409, "DAY_LOCKED", error.message);
  return null;
}

/** Query string riwayat → filter service (dipakai daftar & ekspor CSV). */
export function cashMovementFiltersFrom(params: URLSearchParams): CashMovementFilters {
  const type = params.get("type");
  return {
    q: params.get("q")?.slice(0, 80) || undefined,
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    type: type === "out" || type === "in" ? type : undefined,
    categoryKey: params.get("category") || undefined,
    cashierId: params.get("cashier") || undefined,
    status: params.get("status") || undefined,
    sessionId: params.get("session") || undefined,
  };
}

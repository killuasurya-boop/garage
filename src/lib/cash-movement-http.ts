import { z } from "zod";

import { fail } from "@/lib/api-response";
import {
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
  counterparty: optionalText(80),
  vendorName: optionalText(80),
  receiptNo: optionalText(60),
  orderRef: optionalText(60),
  employeeUserId: optionalText(80),
  relatedRef: optionalText(40),
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

import { fail } from "@/lib/api-response";
import { PayrollPaymentError } from "@/lib/garage-payroll-payments";

// Respons error bersama untuk route gajian & kasbon.
export function payrollPaymentErrorResponse(err: unknown) {
  if (err instanceof PayrollPaymentError) {
    const conflict = ["NOTHING_TO_PAY", "ALREADY_CANCELLED", "ADVANCE_SETTLED", "ALREADY_PAID"].includes(err.code);
    return fail(err.code === "NOT_FOUND" ? 404 : conflict ? 409 : 400, err.code, err.message);
  }
  return fail(500, "PAYMENT_FAILED", (err as Error).message);
}

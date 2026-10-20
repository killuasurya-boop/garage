import { fail } from "@/lib/api-response";
import { AccountabilityError } from "@/lib/cashier-accountability";

/** AccountabilityError → `{ error: { code, message } }` dengan status yang sesuai. */
export function accountabilityFailure(error: unknown) {
  if (error instanceof AccountabilityError) return fail(error.status, error.code, error.message);
  throw error;
}

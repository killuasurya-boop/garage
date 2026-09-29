import { fail, ok } from "@/lib/api-response";
import { ClosingError } from "@/lib/finance-closing";

/** Bungkus aksi closing: ClosingError → 409 dengan kode yang jelas. */
export async function closingResponse<T>(run: () => Promise<T>) {
  try {
    return ok(await run());
  } catch (error) {
    if (error instanceof ClosingError) {
      return fail(409, error.code, error.message);
    }
    console.error("[finance/closing]", error);
    return fail(500, "CLOSING_ERROR", "Proses closing gagal.");
  }
}

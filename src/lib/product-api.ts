import { fail } from "@/lib/api-response";
import { ProductManagementError } from "@/lib/product-management";

/** Error domain Manajemen Produk → respons { error: { code, message } }. */
export function productErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ProductManagementError) return fail(error.status, error.code, error.message);
  if (error instanceof Error && error.message) return fail(400, "PRODUCT_REQUEST_FAILED", error.message);
  console.error("[products]", error);
  return fail(500, "PRODUCT_REQUEST_FAILED", fallback);
}

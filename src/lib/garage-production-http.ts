import { fail } from "@/lib/api-response";
import { FifoOverrideError, ProductionBatchError } from "@/lib/garage-production";
import { ProductionBatchPendingError } from "@/lib/garage-production-tickets";
import { CompletionPrintError } from "@/lib/production-completion-print";
import {
  HandoverPermissionError,
  HandoverRequiredError,
  KitchenTransitionError,
  ProductionPermissionError,
  ProductionQcRequiredError,
  ProductionReopenError,
} from "@/lib/garage-service";

// Peta error domain Production Hub → respons API { error: { code, message } }.
// Mengembalikan null untuk error tak dikenal (biar route melempar ulang).
export function productionErrorResponse(error: unknown) {
  if (error instanceof ProductionPermissionError || error instanceof HandoverPermissionError) {
    return fail(403, "WORKSTATION_FORBIDDEN", error.message);
  }
  if (error instanceof HandoverRequiredError) {
    return fail(422, "HANDOVER_REQUIRED", error.message);
  }
  if (error instanceof ProductionQcRequiredError) {
    return fail(422, "QC_REQUIRED", error.message);
  }
  if (error instanceof ProductionReopenError) {
    return fail(422, "REOPEN_INVALID", error.message);
  }
  if (error instanceof ProductionBatchPendingError) {
    return fail(422, "BATCH_PENDING", error.message);
  }
  if (error instanceof KitchenTransitionError) {
    return fail(422, "INVALID_TRANSITION", "Status tiket sudah berubah. Muat ulang papan.");
  }
  if (error instanceof FifoOverrideError) {
    return fail(error.code === "FORBIDDEN" ? 403 : 422, `FIFO_OVERRIDE_${error.code}`, error.message);
  }
  if (error instanceof ProductionBatchError) {
    const status = error.code === "BATCH_NOT_FOUND" ? 404 : error.code === "BATCH_CONFLICT" ? 409 : 422;
    return fail(status, error.code, error.message);
  }
  return null;
}

// Antrean tiket SELESAI (V4) → respons API.
export function completionPrintErrorResponse(error: unknown) {
  if (!(error instanceof CompletionPrintError)) return null;
  const status =
    error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : 422;
  return fail(status, `COMPLETION_PRINT_${error.code}`, error.message);
}

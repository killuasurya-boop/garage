import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  CORRECTABLE_PAYMENT_METHODS,
  PaymentCorrectionError,
  correctPaymentMethod,
} from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  paymentId: z.string().uuid().optional(),
  method: z.enum(CORRECTABLE_PAYMENT_METHODS),
  reason: z.string().trim().min(3, "Tulis alasan koreksi (min. 3 huruf).").max(200),
  managerPin: z.string().trim().regex(/^\d{4,8}$/, "PIN harus 4–8 digit angka.").optional(),
});

// Koreksi metode bayar (Cash↔QRIS↔Transfer) selama shift pembayaran masih terbuka.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "payment-method-correction", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) return session.response;

  const body = await readJson(request, schema);
  if (body.error) return body.error;

  const { id } = await context.params;
  try {
    return ok(await correctPaymentMethod(id, body.data, session.data));
  } catch (error) {
    if (error instanceof PaymentCorrectionError) {
      return fail(error.status, error.code, error.message);
    }
    if (error instanceof Error && /^PIN salah|Terlalu banyak/i.test(error.message)) {
      return fail(403, "MANAGER_PIN_INVALID", error.message);
    }
    throw error;
  }
}

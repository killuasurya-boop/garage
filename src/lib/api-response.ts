import { z, ZodError, type ZodSchema } from "zod";

// Pesan validasi bawaan Zod dalam Bahasa Indonesia (pesan custom tetap dipakai).
z.config(z.locales.id());

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ data }, init);
}

export function fail(status: number, code: string, message: string) {
  return Response.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export async function readJson<T>(request: Request, schema: ZodSchema<T>) {
  try {
    const payload = await request.json();
    return { data: schema.parse(payload), error: null as null };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        data: null,
        error: fail(
          400,
          "VALIDATION_ERROR",
          error.issues.map((issue) => issue.message).join("; "),
        ),
      };
    }

    return {
      data: null,
      error: fail(400, "INVALID_JSON", "Data yang dikirim bukan JSON yang valid."),
    };
  }
}

// Pesan error internal (SQL, nama tabel/constraint, koneksi) tidak boleh sampai ke layar kasir (S8).
const INTERNAL_ERROR_PATTERN =
  /\b(relation|violates|syntax error|column|constraint|duplicate key|ECONN\w*|timeout expired|failed query|params:|deadlock)\b|\binsert\s+into\b|\bdelete\s+from\b|\bupdate\s+"?\w+"?\s+set\b|\bselect\s.+\sfrom\b/i;

export function isInternalErrorMessage(message: string) {
  return !message.trim() || INTERNAL_ERROR_PATTERN.test(message);
}

/**
 * Ubah error service menjadi respons untuk klien:
 * - error ber-`code` HURUF_BESAR → kode itu + pesannya (IDEMPOTENCY_MISMATCH / *_CONFLICT = 409, lain 400);
 * - pesan aturan bisnis → 400 dengan pesannya;
 * - pesan internal/DB → 500 dengan pesan umum (detail hanya di log server, tanpa data sensitif).
 */
export function serviceErrorResponse(error: unknown, fallbackCode: string, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : "";
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^[A-Z][A-Z_]{3,}$/.test(code) && !isInternalErrorMessage(message)) {
    return fail(code === "IDEMPOTENCY_MISMATCH" || code.endsWith("_CONFLICT") ? 409 : 400, code, message);
  }
  if (!message || isInternalErrorMessage(message)) {
    console.error(`[${fallbackCode}]`, error instanceof Error ? error.name : typeof error);
    return fail(500, fallbackCode, fallbackMessage);
  }
  return fail(400, fallbackCode, message);
}

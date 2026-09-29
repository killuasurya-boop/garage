import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { reopenFinanceDay } from "@/lib/finance-closing";
import { closingResponse } from "@/lib/finance-closing-api";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD."),
  reason: z.string().trim().min(5, "Alasan buka ulang wajib diisi (min. 5 karakter).").max(500),
});

// Buka ulang hari yang terkunci = adjustment; hanya Owner, wajib alasan (audit trail).
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) {
    return session.response;
  }
  const body = await readJson(request, schema);
  if (body.error) {
    return body.error;
  }
  return closingResponse(() => reopenFinanceDay(body.data, session.data));
}

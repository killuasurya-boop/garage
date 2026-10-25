import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { getCashOversight, jakartaDateKey } from "@/lib/cash-oversight";
import { oversightWorkbook } from "@/lib/cash-oversight-xlsx";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD.");
const querySchema = z.object({
  from: dateKey.optional(),
  to: dateKey.optional(),
  outlet: z.string().uuid().optional(),
  format: z.enum(["json", "xlsx"]).optional(),
});

/** Pengawasan kas (Owner): antrean tindakan, pengecualian kontrol, saldo buku kas. */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return fail(400, "INVALID_QUERY", parsed.error.issues[0]?.message ?? "Parameter tidak valid.");
  const today = jakartaDateKey(new Date());
  const toDate = parsed.data.to ?? today;
  const fromDate = parsed.data.from ?? jakartaDateKey(new Date(new Date(`${toDate}T00:00:00+07:00`).getTime() - 6 * 86_400_000));
  if (fromDate > toDate) return fail(400, "INVALID_RANGE", "Tanggal awal setelah tanggal akhir.");
  const data = await getCashOversight({ fromDate, toDate, outletId: parsed.data.outlet ?? null });
  if (parsed.data.format !== "xlsx") return ok(data);

  const buffer = await oversightWorkbook(data);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="GarageOS_PengawasanKas_${fromDate}_${toDate}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

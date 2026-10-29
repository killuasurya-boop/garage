import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { recordSupplierPayment } from "@/lib/wms-procurement";
import { FUND_SOURCES } from "@/lib/wms-procurement-meta";
import { procActor } from "@/lib/wms-procurement-route";
import { isValidSupplierDocPath } from "@/lib/wms-supplier-docs";
import { withMasterErrors } from "@/lib/wms-master-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  billId: z.string().uuid().nullable().optional(),
  purchaseOrderId: z.string().uuid().nullable().optional(),
  kind: z.enum(["payment", "dp"]),
  amount: z.number().int().positive().max(2_000_000_000),
  method: z.enum(["cash", "transfer"]),
  // Laci kasir sengaja tidak ada di daftar ini.
  fundSource: z.enum(FUND_SOURCES),
  reference: z.string().trim().max(120).optional(),
  proofUrl: z.string().refine(isValidSupplierDocPath, "Berkas bukti tidak valid.").nullable().optional(),
  paidAt: z.string().datetime({ offset: true }).nullable().optional(),
});

/** Catat pembayaran / DP supplier. Tidak membuat pengeluaran baru (biaya sudah dari penerimaan). */
export async function POST(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  return withMasterErrors(async () => ok(await recordSupplierPayment(parsed.data, procActor(session.data)), { status: 201 }));
}

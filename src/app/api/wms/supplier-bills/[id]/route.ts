import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { updateBillInvoice } from "@/lib/wms-procurement";
import { procActor } from "@/lib/wms-procurement-route";
import { isValidSupplierDocPath } from "@/lib/wms-supplier-docs";
import { withMasterErrors } from "@/lib/wms-master-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  invoiceNo: z.string().trim().max(80).optional(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  invoiceUrl: z.string().refine(isValidSupplierDocPath, "Berkas invoice tidak valid.").nullable().optional(),
  note: z.string().trim().max(300).optional(),
});

/** Tautkan invoice supplier (nomor, tanggal, jatuh tempo, berkas) ke tagihan. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  return withMasterErrors(async () => ok(await updateBillInvoice(id, parsed.data, procActor(session.data))));
}

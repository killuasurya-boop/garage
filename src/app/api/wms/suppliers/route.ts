import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createWmsSupplier, listWmsSuppliers, redactSupplierBank } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES, wmsIsElevated } from "@/lib/wms-access";
import { masterActor, withMasterErrors } from "@/lib/wms-master-route";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional(), // nomor WhatsApp, divalidasi di service
  address: z.string().trim().max(300).optional(),
  note: z.string().trim().max(200).optional(),
  picName: z.string().trim().max(120).optional(),
  areas: z.array(z.enum(["bar", "dapur", "umum", "teknik"])).max(4).optional(),
  productCategories: z.string().trim().max(200).optional(),
  paymentMethod: z.enum(["", "cash", "transfer", "tempo"]).optional(),
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  bankName: z.string().trim().max(60).optional(),
  bankAccountNumber: z.string().trim().max(40).optional(),
  bankAccountName: z.string().trim().max(120).optional(),
});

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const includeArchived = new URL(request.url).searchParams.get("archived") === "1";
  const rows = await listWmsSuppliers({ includeArchived });
  // Rekening supplier hanya untuk Owner/Manajer.
  return ok(wmsIsElevated(session.data.profile.role) ? rows : rows.map(redactSupplierBank));
}

export async function POST(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;
  return withMasterErrors(async () => ok(await createWmsSupplier(parsed.data, masterActor(session.data)), { status: 201 }));
}

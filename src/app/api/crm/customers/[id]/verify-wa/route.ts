import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { fail, ok } from "@/lib/api-response";
import { createAuditLog } from "@/lib/garage-service";
import { requireAnyPermission } from "@/lib/server-auth";
import { normalizeWaNumber } from "@/lib/whatsapp-link";

export const runtime = "nodejs";

async function setVerified(request: Request, context: { params: Promise<{ id: string }> }, verified: boolean) {
  // Kasir (POS) juga boleh: verifikasi dilakukan saat pelanggan di depan kasir.
  const session = await requireAnyPermission(["crm:write", "pos:use"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_CUSTOMER_ID", "ID member tidak valid.");
  const db = getDb();
  const [customer] = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone })
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  if (!customer) return fail(404, "CUSTOMER_NOT_FOUND", "Member tidak ditemukan.");
  if (verified && !normalizeWaNumber(customer.phone)) {
    return fail(409, "PHONE_NOT_WHATSAPP", "Nomor member bukan nomor WhatsApp yang valid. Perbaiki nomornya dulu.");
  }
  const now = new Date();
  await db
    .update(customers)
    .set({
      waVerifiedAt: verified ? now : null,
      waVerifiedBy: verified ? session.data.user.id : null,
      updatedAt: now,
    })
    .where(eq(customers.id, id));
  await createAuditLog({
    actor: `${session.data.user.name} / ${session.data.profile.role}`,
    action: verified ? "CRM: WA member ditandai aktif" : "CRM: tanda WA aktif dicabut",
    object: customer.name,
    device: session.data.profile.deviceLabel ?? "OS",
    metadata: { customerId: id },
  }).catch(() => undefined);
  return ok({ id, waVerifiedAt: verified ? now.toISOString() : null });
}

// Kasir/Manajer menandai nomor WA member aktif setelah menghubungi lewat wa.me.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return setVerified(request, context, true);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return setVerified(request, context, false);
}

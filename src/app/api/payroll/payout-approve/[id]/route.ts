import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { auditLogs, staffPayoutRequests, user } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { createExpense } from "@/lib/garage-service";

export const runtime = "nodejs";

const OWNER_ROLES = ["Owner / CEO", "Admin", "Finance / CFO"] as const;

const schema = z.object({
  note: z.string().max(500).optional().nullable(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Ctx) {
  const session = await requireGarageSession([...OWNER_ROLES]);
  if (session.response) return session.response;

  const { id } = await params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;

  try {
    const db = getDb();
    const now = new Date();

    // Transaction: cek status pending → approved, catat audit.
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(staffPayoutRequests)
        .where(and(eq(staffPayoutRequests.id, id), eq(staffPayoutRequests.status, "pending")))
        .limit(1);
      if (!row) throw new Error("Payout tidak ditemukan atau status bukan pending.");

      const [updated] = await tx
        .update(staffPayoutRequests)
        .set({
          status: "approved",
          reviewedBy: session.data!.user.id,
          reviewedAt: now,
          reviewNote: body.data.note ?? null,
        })
        .where(eq(staffPayoutRequests.id, id))
        .returning();

      await tx.insert(auditLogs).values({
        time: now.toISOString(),
        actor: session.data!.user.id,
        action: "payout_approve",
        object: `payout=${id}`,
        device: "web",
        status: "success",
        metadata: {
          payoutId: id,
          staffUserId: row.staffUserId,
          walletType: row.walletType,
          amountGaji: row.amountGaji,
          amountFee: row.amountFee,
        } as Record<string, unknown>,
      });

      return updated;
    });

    // Auto-catat ke Finance sbg expense: 2 entry terpisah kalau ada wallet keduanya.
    try {
      const [staff] = await db.select({ name: user.name }).from(user).where(eq(user.id, result.staffUserId)).limit(1);
      const staffName = staff?.name ?? "Staff";
      const expensesCreated: Array<{ kind: string; id?: string }> = [];
      if (result.amountGaji > 0) {
        const exp = await createExpense(
          {
            category: "Gaji Karyawan",
            description: `Payout gaji ${staffName} (payout ${result.id})`,
            amount: result.amountGaji,
            paymentMethod: "Cash",
            notes: body.data.note ?? undefined,
          },
          session.data!,
        );
        expensesCreated.push({ kind: "gaji", id: (exp as { id?: string })?.id });
      }
      if (result.amountFee > 0) {
        const exp = await createExpense(
          {
            category: "Fee/Insentif Karyawan",
            description: `Payout fee ${staffName} (payout ${result.id})`,
            amount: result.amountFee,
            paymentMethod: "Cash",
            notes: body.data.note ?? undefined,
          },
          session.data!,
        );
        expensesCreated.push({ kind: "fee", id: (exp as { id?: string })?.id });
      }
      // Update status → paid
      await db
        .update(staffPayoutRequests)
        .set({ status: "paid", paidAt: new Date() })
        .where(eq(staffPayoutRequests.id, id));
    } catch (err) {
      // Approve tetap sukses walau expense gagal — owner bisa retry manual.
      console.error("[payout-approve] expense hook failed:", (err as Error).message);
    }

    return ok({ request: result });
  } catch (err) {
    return fail(500, "PAYOUT_APPROVE_FAILED", (err as Error).message);
  }
}

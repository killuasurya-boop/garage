import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { staffShiftHandovers, staffProfiles, user } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";
import { fail } from "@/lib/api-response";

const SHIFT_VALUES = ["pagi", "sore", "malam"] as const;

const createSchema = z.object({
  action: z.literal("create"),
  fromShift: z.enum(SHIFT_VALUES),
  toShift: z.enum(SHIFT_VALUES),
  cashInDrawer: z.number().int().min(0),
  notes: z.string().trim().max(500).optional(),
});

const validateSchema = z.object({
  action: z.literal("validate"),
  id: z.string().uuid(),
});

const disputeSchema = z.object({
  action: z.literal("dispute"),
  id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

const bodySchema = z.discriminatedUnion("action", [
  createSchema,
  validateSchema,
  disputeSchema,
]);

export async function GET() {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const db = await getDb();
    const outletId = session.data.profile.outlet.id;

    const rows = await db
      .select({
        id: staffShiftHandovers.id,
        outletId: staffShiftHandovers.outletId,
        fromStaffId: staffShiftHandovers.fromStaffId,
        toStaffId: staffShiftHandovers.toStaffId,
        fromShift: staffShiftHandovers.fromShift,
        toShift: staffShiftHandovers.toShift,
        cashInDrawer: staffShiftHandovers.cashInDrawer,
        notes: staffShiftHandovers.notes,
        status: staffShiftHandovers.status,
        disputeReason: staffShiftHandovers.disputeReason,
        validatedAt: staffShiftHandovers.validatedAt,
        createdAt: staffShiftHandovers.createdAt,
      })
      .from(staffShiftHandovers)
      .where(eq(staffShiftHandovers.outletId, outletId))
      .orderBy(desc(staffShiftHandovers.createdAt))
      .limit(50);

    // Enrich with staff names
    const staffIds = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.fromStaffId, r.toStaffId])
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const nameMap = new Map<string, { name: string; role: string }>();
    if (staffIds.length > 0) {
      const staffRows = await db
        .select({
          id: staffProfiles.id,
          name: user.name,
          role: staffProfiles.role,
        })
        .from(staffProfiles)
        .innerJoin(user, eq(staffProfiles.userId, user.id));
      for (const s of staffRows) {
        nameMap.set(s.id, { name: s.name, role: s.role });
      }
    }

    const enriched = rows.map((r) => ({
      ...r,
      fromStaff: r.fromStaffId ? nameMap.get(r.fromStaffId) ?? null : null,
      toStaff: r.toStaffId ? nameMap.get(r.toStaffId) ?? null : null,
    }));

    return NextResponse.json({ handovers: enriched });
  } catch (error) {
    console.error("Failed to fetch shift handovers:", error);
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(400, "VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join("; ") || "Payload tidak valid");
    }

    const db = await getDb();
    const outletId = session.data.profile.outlet.id;
    const myStaffId = session.data.profile.id;

    if (parsed.data.action === "create") {
      const { fromShift, toShift, cashInDrawer, notes } = parsed.data;
      const [row] = await db
        .insert(staffShiftHandovers)
        .values({
          outletId,
          fromStaffId: myStaffId,
          fromShift,
          toShift,
          cashInDrawer,
          notes: notes ?? null,
          status: "pending_validation",
        })
        .returning();
      return NextResponse.json({ handover: row });
    }

    if (parsed.data.action === "validate") {
      await db
        .update(staffShiftHandovers)
        .set({
          status: "validated",
          toStaffId: myStaffId,
          validatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(staffShiftHandovers.id, parsed.data.id));
      return NextResponse.json({ success: true });
    }

    // dispute
    await db
      .update(staffShiftHandovers)
      .set({
        status: "disputed",
        toStaffId: myStaffId,
        disputeReason: parsed.data.reason,
        updatedAt: new Date(),
      })
      .where(eq(staffShiftHandovers.id, parsed.data.id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to manage shift handover:", error);
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}

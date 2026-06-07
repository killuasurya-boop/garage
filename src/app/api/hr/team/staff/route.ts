import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { staffProfiles, user } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";
import { eq } from "drizzle-orm";
import { fail } from "@/lib/api-response";

const ROLE_VALUES = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Finance / CFO",
  "Kasir",
  "Barista",
  "Koki",
  "Asisten Koki",
  "Waiter 1",
  "Waiter 2",
  "Kitchen / Barista",
  "Gudang",
  "Supervisor Shift",
  "Delivery Admin",
] as const;

const patchStaffSchema = z.object({
  id: z.string().min(1),
  division: z.string().trim().max(80).optional(),
  position: z.string().trim().max(80).optional(),
  pinCode: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "PIN harus 4-8 digit angka")
    .optional(),
  status: z.enum(["active", "suspended", "inactive"]).optional(),
  shiftLabel: z.string().trim().max(80).optional(),
  role: z.enum(ROLE_VALUES).optional(),
});

export async function GET() {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const db = await getDb();

    // Query active staff profiles along with their name, email, division, position, and pinCode
    const staffList = await db
      .select({
        id: staffProfiles.id,
        userId: staffProfiles.userId,
        outletId: staffProfiles.outletId,
        role: staffProfiles.role,
        shiftLabel: staffProfiles.shiftLabel,
        deviceLabel: staffProfiles.deviceLabel,
        status: staffProfiles.status,
        division: staffProfiles.division,
        position: staffProfiles.position,
        pinCode: staffProfiles.pinCode,
        name: user.name,
        email: user.email,
      })
      .from(staffProfiles)
      .innerJoin(user, eq(staffProfiles.userId, user.id));

    return NextResponse.json({ staff: staffList });
  } catch (error) {
    console.error("Failed to fetch staff list:", error);
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const parsed = patchStaffSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(400, "VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join("; ") || "Payload tidak valid");
    }
    const { id, division, position, pinCode, status, shiftLabel, role } = parsed.data;

    const db = await getDb();

    const updateData: Partial<typeof staffProfiles.$inferInsert> = {};
    if (division !== undefined) updateData.division = division;
    if (position !== undefined) updateData.position = position;
    if (pinCode !== undefined) updateData.pinCode = pinCode;
    if (status !== undefined) updateData.status = status;
    if (shiftLabel !== undefined) updateData.shiftLabel = shiftLabel;
    if (role !== undefined) updateData.role = role;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true, noop: true });
    }

    await db
      .update(staffProfiles)
      .set(updateData)
      .where(eq(staffProfiles.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update staff profile:", error);
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { session as sessionTable, staffProfiles, user } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";
import { eq } from "drizzle-orm";
import { fail } from "@/lib/api-response";
import { hashPin } from "@/lib/attendance";
import { protectedRoleRank } from "@/lib/role-access";
import { countOwners, pinTakenByOther } from "@/lib/admin-user-service";
import type { Role } from "@/lib/garage-data";

const ROLE_VALUES = ["Owner", "Manajer", "Kasir", "Waiter"] as const;

const patchStaffSchema = z.object({
  id: z.string().min(1),
  division: z.string().trim().max(80).optional(),
  position: z.string().trim().max(80).optional(),
  // Kosong = PIN tidak diubah.
  pinCode: z
    .string()
    .trim()
    .regex(/^(\d{4,8})?$/, "PIN harus 4-8 digit angka")
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
        pinHash: staffProfiles.pinHash,
        name: user.name,
        email: user.email,
      })
      .from(staffProfiles)
      .innerJoin(user, eq(staffProfiles.userId, user.id));

    // PIN absen tidak pernah dikirim ke browser — hanya status "sudah diatur".
    return NextResponse.json({
      staff: staffList.map(({ pinCode, pinHash, ...row }) => ({
        ...row,
        hasPin: Boolean(pinHash || pinCode),
      })),
    });
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

    // Jenjang role sama dengan Manajemen User: Manajer tidak boleh mengubah
    // akun Owner, dan tidak boleh menaikkan siapa pun menjadi Owner/Manajer.
    const actorRole = session.data.profile.role as Role;
    const [target] = await db
      .select({ role: staffProfiles.role, userId: staffProfiles.userId, status: staffProfiles.status })
      .from(staffProfiles)
      .where(eq(staffProfiles.id, id))
      .limit(1);
    if (!target) {
      return fail(404, "NOT_FOUND", "Profil staf tidak ditemukan.");
    }
    // Owner terakhir tidak boleh dinonaktifkan/diturunkan — sistem akan terkunci.
    if (
      target.role === "Owner" &&
      ((status && status !== "active") || (role && role !== "Owner")) &&
      (await countOwners()) <= 1
    ) {
      return fail(409, "LAST_OWNER", "Owner terakhir tidak boleh dinonaktifkan atau diturunkan rolenya.");
    }
    if (pinCode && (await pinTakenByOther(pinCode, target.userId))) {
      return fail(409, "PIN_TAKEN", "PIN ini sudah dipakai staf lain. Pilih PIN lain.");
    }
    if (actorRole !== "Owner") {
      const actorRank = protectedRoleRank[actorRole];
      if (protectedRoleRank[target.role as Role] >= actorRank || (role && protectedRoleRank[role] >= actorRank)) {
        return fail(403, "FORBIDDEN", "Role anda tidak boleh mengubah akun dengan level akses ini.");
      }
    }

    const updateData: Partial<typeof staffProfiles.$inferInsert> = {};
    if (division !== undefined) updateData.division = division;
    if (position !== undefined) updateData.position = position;
    if (pinCode) {
      // Disimpan sebagai hash (sama seperti Manajemen User); teks asli dibuang.
      updateData.pinHash = hashPin(pinCode);
      updateData.pinCode = null;
    }
    if (status !== undefined) updateData.status = status;
    if (shiftLabel !== undefined) updateData.shiftLabel = shiftLabel;
    if (role !== undefined) updateData.role = role;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true, noop: true });
    }

    await db
      .update(staffProfiles)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(staffProfiles.id, id));

    // Status non-aktif/suspend: putus semua sesi login yang masih berjalan.
    if (status && status !== "active") {
      const [profile] = await db
        .select({ userId: staffProfiles.userId })
        .from(staffProfiles)
        .where(eq(staffProfiles.id, id))
        .limit(1);
      if (profile) await db.delete(sessionTable).where(eq(sessionTable.userId, profile.userId));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update staff profile:", error);
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}

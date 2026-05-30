import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { staffProfiles, employeeAttendances, operationLocations, user } from "@/db/schema";
import { requireGarageSession } from "@/lib/server-auth";

const attendanceSchema = z.object({
  pinCode: z.string().trim().min(4).max(12),
  action: z.enum(["in", "out"]),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Radius bumi dalam meter
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Jarak dalam meter
}

export async function POST(req: Request) {
  try {
    const session = await requireGarageSession();
    if (session.response) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = attendanceSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Absensi memerlukan PIN yang valid dan koordinat GPS. Pastikan izin lokasi peramban diaktifkan.",
        },
        { status: 400 },
      );
    }
    const { pinCode, action, latitude, longitude } = parsed.data;

    const db = await getDb();

    // Verify the PIN
    const staff = await db
      .select({
        id: staffProfiles.id,
        outletId: staffProfiles.outletId,
        status: staffProfiles.status,
        name: user.name,
      })
      .from(staffProfiles)
      .innerJoin(user, eq(staffProfiles.userId, user.id))
      .where(eq(staffProfiles.pinCode, pinCode))
      .limit(1)
      .then((rows) => rows[0]);

    if (!staff) {
      return NextResponse.json({ error: "PIN tidak ditemukan" }, { status: 404 });
    }

    if (staff.status !== "active") {
      return NextResponse.json({ error: "Akun karyawan tidak aktif" }, { status: 403 });
    }

    // Geofencing Check
    const activeGeofence = await db
      .select()
      .from(operationLocations)
      .where(
        and(
          eq(operationLocations.outletId, staff.outletId),
          eq(operationLocations.type, "presensi")
        )
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (activeGeofence) {
      const distance = calculateDistance(
        latitude,
        longitude,
        activeGeofence.latitude,
        activeGeofence.longitude,
      );

      if (distance > activeGeofence.radius) {
        return NextResponse.json(
          {
            error: `Absensi gagal. Anda berada di luar radius outlet. Jarak Anda: ${Math.round(
              distance,
            )}m, Radius Maksimal: ${activeGeofence.radius}m.`,
          },
          { status: 400 },
        );
      }
    }

    // Insert attendance record
    await db.insert(employeeAttendances).values({
      staffId: staff.id,
      outletId: staff.outletId,
      action: action,
    });

    return NextResponse.json({
      success: true,
      staffName: staff.name,
      action,
    });
  } catch (error) {
    console.error("Attendance error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

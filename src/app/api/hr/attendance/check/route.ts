import { NextResponse } from "next/server";
import { eq, and, gte, lt, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  staffProfiles,
  employeeAttendances,
  shiftSchedules,
  user,
} from "@/db/schema";
import {
  hashPin,
  jakartaDayRange,
  jakartaDateKey,
  checkRateLimit,
  recordFailedAttempt,
} from "@/lib/attendance";
import { getAppSettings } from "@/lib/garage-service";

export const runtime = "nodejs";

const checkSchema = z.object({
  pinCode: z.string().trim().regex(/^\d{4,8}$/, "PIN harus 4-8 digit angka"),
});

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "kiosk";
}

// Cek status absensi staff (IN/OUT terakhir + jadwal shift hari ini) TANPA
// mencatat punch. Kiosk publik di-auth oleh PIN (lihat catatan di POST punch).
export async function POST(req: Request) {
  try {
    const rateKey = `attendance-check:${clientIp(req)}`;
    const limit = checkRateLimit(rateKey);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Terlalu banyak percobaan. Coba lagi dalam ${limit.retryAfterSec}s.` },
        { status: 429 },
      );
    }

    const parsed = checkSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "PIN tidak valid" }, { status: 400 });
    }

    const db = await getDb();
    const pinHashValue = hashPin(parsed.data.pinCode);

    const staff = await db
      .select({
        id: staffProfiles.id,
        outletId: staffProfiles.outletId,
        status: staffProfiles.status,
        name: user.name,
        role: staffProfiles.role,
      })
      .from(staffProfiles)
      .innerJoin(user, eq(staffProfiles.userId, user.id))
      .where(eq(staffProfiles.pinHash, pinHashValue))
      .limit(1)
      .then((rows) => rows[0]);

    let resolved = staff;
    if (!resolved) {
      resolved = await db
        .select({
          id: staffProfiles.id,
          outletId: staffProfiles.outletId,
          status: staffProfiles.status,
          name: user.name,
          role: staffProfiles.role,
        })
        .from(staffProfiles)
        .innerJoin(user, eq(staffProfiles.userId, user.id))
        .where(eq(staffProfiles.pinCode, parsed.data.pinCode))
        .limit(1)
        .then((rows) => rows[0]);
    }

    if (!resolved) {
      recordFailedAttempt(rateKey);
      return NextResponse.json({ error: "PIN tidak ditemukan" }, { status: 404 });
    }
    if (resolved.status !== "active") {
      return NextResponse.json({ error: "Akun karyawan tidak aktif" }, { status: 403 });
    }

    const { start, end } = jakartaDayRange();
    const last = await db
      .select({ action: employeeAttendances.action, timestamp: employeeAttendances.timestamp })
      .from(employeeAttendances)
      .where(
        and(
          eq(employeeAttendances.staffId, resolved.id),
          gte(employeeAttendances.timestamp, start),
          lt(employeeAttendances.timestamp, end),
        ),
      )
      .orderBy(desc(employeeAttendances.timestamp))
      .limit(1)
      .then((rows) => rows[0]);

    const schedule = await db
      .select({
        shiftType: shiftSchedules.shiftType,
        startTime: shiftSchedules.startTime,
        endTime: shiftSchedules.endTime,
      })
      .from(shiftSchedules)
      .where(
        and(
          eq(shiftSchedules.staffId, resolved.id),
          eq(shiftSchedules.date, jakartaDateKey()),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    const currentState: "in" | "out" = last?.action === "in" ? "in" : "out";
    const settings = await getAppSettings(resolved.outletId);

    return NextResponse.json({
      staffName: resolved.name,
      role: resolved.role,
      currentState,
      lastPunchAt: last?.timestamp?.toISOString() ?? null,
      lastAction: last?.action ?? null,
      schedule: schedule
        ? {
            shiftType: schedule.shiftType,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
          }
        : null,
      attendancePolicy: {
        enabled: settings.attendanceEnabled,
        terminalMode: settings.attendanceTerminalMode,
        gpsRequired:
          settings.attendanceTerminalMode !== "pin_only" && settings.attendanceRequireGps,
        selfieRequired:
          settings.attendanceTerminalMode === "pin_gps_selfie" ||
          settings.attendanceRequireSelfie,
        blockDoublePunch: settings.attendanceBlockDoublePunch,
      },
    });
  } catch (error) {
    console.error("Attendance check error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

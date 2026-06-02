import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { eq, and, gte, lt, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  staffProfiles,
  employeeAttendances,
  operationLocations,
  shiftSchedules,
  user,
} from "@/db/schema";
import {
  hashPin,
  pinHashEquals,
  haversineMeters,
  jakartaDayRange,
  jakartaDateKey,
  evaluatePunchStatus,
  attendanceStatusLabel,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
} from "@/lib/attendance";
import { getAppSettings } from "@/lib/garage-service";

export const runtime = "nodejs";

const attendanceSchema = z.object({
  pinCode: z.string().trim().regex(/^\d{4,8}$/, "PIN harus 4-8 digit angka"),
  action: z.enum(["in", "out"]),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  // Selfie wajah opsional (dataURL image/jpeg|png base64). Anti titip-absen.
  selfie: z.string().max(3_500_000).optional(),
});

function clampMinutes(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(120, Math.round(value)));
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "kiosk";
}

// Simpan selfie dataURL ke public/uploads/attendance. Return path publik atau null.
async function saveSelfie(dataUrl: string | undefined): Promise<string | null> {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > 3_000_000) return null; // guard ~3MB
  const dir = path.join(process.cwd(), "public", "uploads", "attendance");
  await mkdir(dir, { recursive: true });
  const filename = `${jakartaDateKey()}-${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/attendance/${filename}`;
}

// Terminal absensi adalah KIOSK PUBLIK: di-auth oleh PIN staff itu sendiri
// (bukan sesi login operator). Keamanan = hash PIN + rate-limit IP + geofence
// + double-punch. Inilah perbaikan "PIN 401": sebelumnya menuntut sesi login.
export async function POST(req: Request) {
  try {
    // Rate-limit per IP terminal untuk cegah brute-force PIN.
    const rateKey = `attendance:${clientIp(req)}`;
    const limit = checkRateLimit(rateKey);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: `Terlalu banyak percobaan PIN salah. Coba lagi dalam ${limit.retryAfterSec}s.`,
        },
        { status: 429 },
      );
    }

    const parsed = attendanceSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Absensi memerlukan PIN 4-8 digit dan koordinat GPS. Pastikan izin lokasi peramban diaktifkan.",
        },
        { status: 400 },
      );
    }
    const { pinCode, action, latitude, longitude, selfie } = parsed.data;

    const db = await getDb();
    const pinHashValue = hashPin(pinCode);

    // Cari staff: prioritaskan pinHash; fallback pinCode plaintext (lazy migrasi).
    const staff = await db
      .select({
        id: staffProfiles.id,
        outletId: staffProfiles.outletId,
        status: staffProfiles.status,
        pinCode: staffProfiles.pinCode,
        pinHash: staffProfiles.pinHash,
        name: user.name,
      })
      .from(staffProfiles)
      .innerJoin(user, eq(staffProfiles.userId, user.id))
      .where(eq(staffProfiles.pinHash, pinHashValue))
      .limit(1)
      .then((rows) => rows[0]);

    let resolved: typeof staff | undefined = staff;
    if (!resolved) {
      // Fallback: cocokkan plaintext lama, lalu upgrade ke hash.
      const legacy = await db
        .select({
          id: staffProfiles.id,
          outletId: staffProfiles.outletId,
          status: staffProfiles.status,
          pinCode: staffProfiles.pinCode,
          pinHash: staffProfiles.pinHash,
          name: user.name,
        })
        .from(staffProfiles)
        .innerJoin(user, eq(staffProfiles.userId, user.id))
        .where(eq(staffProfiles.pinCode, pinCode))
        .limit(1)
        .then((rows) => rows[0]);
      if (legacy) {
        await db
          .update(staffProfiles)
          .set({ pinHash: pinHashValue, pinCode: null })
          .where(eq(staffProfiles.id, legacy.id));
        resolved = legacy;
      }
    } else if (resolved.pinHash && !pinHashEquals(resolved.pinHash, pinHashValue)) {
      // Index lookup sudah eq, ini guard tambahan (timing-safe).
      resolved = undefined;
    }

    if (!resolved) {
      recordFailedAttempt(rateKey);
      return NextResponse.json({ error: "PIN tidak ditemukan" }, { status: 404 });
    }
    resetRateLimit(rateKey);

    if (resolved.status !== "active") {
      return NextResponse.json({ error: "Akun karyawan tidak aktif" }, { status: 403 });
    }

    const settings = await getAppSettings(resolved.outletId);
    if (!settings.attendanceEnabled) {
      return NextResponse.json(
        { error: "Absensi sedang dinonaktifkan oleh admin." },
        { status: 403 },
      );
    }

    const gpsRequired =
      settings.attendanceTerminalMode !== "pin_only" && settings.attendanceRequireGps;
    const selfieRequired =
      settings.attendanceTerminalMode === "pin_gps_selfie" ||
      settings.attendanceRequireSelfie;

    if (gpsRequired && (latitude == null || longitude == null)) {
      return NextResponse.json(
        { error: "Absensi membutuhkan GPS. Aktifkan izin lokasi lalu coba lagi." },
        { status: 400 },
      );
    }

    if (selfieRequired && !selfie) {
      return NextResponse.json(
        { error: "Absensi membutuhkan selfie wajah. Aktifkan kamera lalu coba lagi." },
        { status: 400 },
      );
    }

    // --- Geofence ---
    const activeGeofence = await db
      .select()
      .from(operationLocations)
      .where(
        and(
          eq(operationLocations.outletId, resolved.outletId),
          eq(operationLocations.type, "presensi"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    let distanceMeters: number | null = null;
    if (gpsRequired && settings.attendanceRequireActiveGeofence && !activeGeofence) {
      return NextResponse.json(
        {
          error:
            "Lokasi presensi outlet belum diset. Hubungi supervisor/admin sebelum absen.",
        },
        { status: 400 },
      );
    }
    if (activeGeofence && latitude != null && longitude != null) {
      distanceMeters = haversineMeters(
        latitude,
        longitude,
        activeGeofence.latitude,
        activeGeofence.longitude,
      );
      if (gpsRequired && distanceMeters > activeGeofence.radius) {
        return NextResponse.json(
          {
            error: `Absensi gagal. Anda di luar radius outlet. Jarak: ${Math.round(
              distanceMeters,
            )}m, maksimal: ${activeGeofence.radius}m.`,
          },
          { status: 400 },
        );
      }
    }

    // --- Double-punch protection ---
    const { start, end } = jakartaDayRange();
    const lastToday = await db
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

    if (settings.attendanceBlockDoublePunch && action === "in" && lastToday?.action === "in") {
      return NextResponse.json(
        { error: "Anda sudah Clock In dan belum Clock Out. Tidak bisa Clock In dua kali." },
        { status: 409 },
      );
    }
    if (
      settings.attendanceBlockDoublePunch &&
      action === "out" &&
      (!lastToday || lastToday.action === "out")
    ) {
      return NextResponse.json(
        { error: "Belum ada Clock In aktif hari ini. Clock In dulu sebelum Clock Out." },
        { status: 409 },
      );
    }

    // --- Shift compliance ---
    const punchAt = new Date();
    const todaySchedule = await db
      .select({
        id: shiftSchedules.id,
        startTime: shiftSchedules.startTime,
        endTime: shiftSchedules.endTime,
        shiftType: shiftSchedules.shiftType,
      })
      .from(shiftSchedules)
      .where(
        and(
          eq(shiftSchedules.staffId, resolved.id),
          eq(shiftSchedules.date, jakartaDateKey(punchAt)),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    const status = todaySchedule
      ? evaluatePunchStatus({
          action,
          punchAt,
          startTime: todaySchedule.startTime,
          endTime: todaySchedule.endTime,
          lateGraceMinutes: clampMinutes(settings.attendanceLateGraceMinutes, 10),
          earlyLeaveGraceMinutes: clampMinutes(settings.attendanceEarlyLeaveGraceMinutes, 10),
        })
      : "normal";

    // Simpan selfie (best-effort; kegagalan tulis tidak membatalkan punch).
    let photoUrl: string | null = null;
    try {
      photoUrl = await saveSelfie(selfie);
    } catch (e) {
      console.error("Gagal simpan selfie absensi:", e);
    }
    if (selfieRequired && !photoUrl) {
      return NextResponse.json(
        { error: "Selfie absensi tidak valid atau gagal disimpan. Coba ambil ulang foto." },
        { status: 400 },
      );
    }

    await db.insert(employeeAttendances).values({
      staffId: resolved.id,
      outletId: resolved.outletId,
      action,
      timestamp: punchAt,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      distanceMeters,
      status,
      scheduleId: todaySchedule?.id ?? null,
      photoUrl,
    });

    return NextResponse.json({
      success: true,
      staffName: resolved.name,
      action,
      status,
      statusLabel: attendanceStatusLabel(status),
      distanceMeters: distanceMeters != null ? Math.round(distanceMeters) : null,
      photoUrl,
    });
  } catch (error) {
    console.error("Attendance error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Payroll V2 — buat 8 identitas absen karyawan Garage + aktifkan aturan gaji.
//
//   npm run payroll:seed                 # buat yang belum ada, PIN hanya utk yang baru
//   npm run payroll:seed -- --reset-pin  # buat ulang PIN semua karyawan
//   npm run payroll:seed -- --reset-wage # timpa gaji harian dari daftar di bawah
//   npm run payroll:seed -- --no-settings
//
// Identitas absen TERPISAH dari akun sistem: user dibuat tanpa password (tidak
// bisa login aplikasi), login absen pakai KODE + PIN di /absen.
// Idempoten. Untuk PGlite lokal, server HARUS mati (akses ganda = DB korup).

import net from "node:net";

import { config } from "dotenv";

// Env dimuat SEBELUM modul aplikasi di-import (dinamis di bawah): attendance.ts
// membaca ATTENDANCE_PIN_PEPPER saat import — urutan salah = hash PIN beda dgn server.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

const EMPLOYEES: Array<{
  code: string;
  name: string;
  position: string;
  role: "Kasir" | "Waiter";
  monthlySalary: number;
  excludeFromFee?: boolean;
  shiftStartMinutes?: number; // jam masuk pribadi (menit sejak 00:00); kosong = 09:00 toko
}> = [
  { code: "BAR1", name: "Barista 1", position: "Barista", role: "Kasir", monthlySalary: 2_000_000 },
  { code: "BAR2", name: "Barista 2", position: "Barista", role: "Kasir", monthlySalary: 2_000_000 },
  { code: "WTR1", name: "Waiter 1", position: "Waiter", role: "Waiter", monthlySalary: 1_500_000 },
  { code: "WTR2", name: "Waiter 2", position: "Waiter", role: "Waiter", monthlySalary: 1_500_000 },
  { code: "KOKI1", name: "Koki 1", position: "Koki", role: "Kasir", monthlySalary: 2_000_000 },
  { code: "ASKOKI", name: "Asisten Koki", position: "Asisten Koki", role: "Kasir", monthlySalary: 1_500_000 },
  {
    code: "JAGA",
    name: "Jaga Malam",
    position: "Jaga Malam",
    role: "Waiter",
    monthlySalary: 2_000_000,
    excludeFromFee: true,
    shiftStartMinutes: 23 * 60, // shift malam, masuk 23:00
  },
  { code: "KSR1", name: "Kasir", position: "Kasir", role: "Kasir", monthlySalary: 1_700_000 },
];

const DAYS_PER_MONTH = 30;
const OVERTIME_HOURLY = 3_000;

const args = new Set(process.argv.slice(2));
const resetPin = args.has("--reset-pin");
const resetWage = args.has("--reset-wage");
const skipSettings = args.has("--no-settings");
const force = args.has("--force");
let dbOpened = false;

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.setTimeout(800);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

async function main() {
  const { eq } = await import("drizzle-orm");
  const db = await import("@/db");
  const { outlets, staffProfiles, staffWageConfig, user } = await import("@/db/schema");
  const { hashPin } = await import("@/lib/attendance");
  const { getPayrollSetting, setPayrollSetting } = await import("@/lib/garage-payroll-settings");
  const { generateAbsenPin } = await import("@/lib/garage-absen-employees");

  if (db.getDatabaseDriver() === "pglite" && !force && (await isPortInUse(3001))) {
    console.error(
      "Server Garage masih berjalan di port 3001. Matikan dulu (PGlite tidak boleh diakses dua proses), lalu ulangi.",
    );
    process.exitCode = 1;
    return;
  }

  dbOpened = true;
  await db.ensureDatabaseReady();
  const d = db.getDb();

  const [preferred] = await d.select().from(outlets).where(eq(outlets.code, "OUTLET-A")).limit(1);
  const outlet = preferred ?? (await d.select().from(outlets).limit(1))[0];
  if (!outlet) throw new Error("Belum ada outlet. Jalankan `npm run db:seed` dulu.");

  const takenPins = new Set<string>();
  const report: Array<Record<string, string>> = [];

  for (const emp of EMPLOYEES) {
    const userId = `payroll-${emp.code.toLowerCase()}`;
    const dailyWage = Math.round(emp.monthlySalary / DAYS_PER_MONTH);
    const now = new Date();

    const [existingUser] = await d.select().from(user).where(eq(user.id, userId)).limit(1);
    if (!existingUser) {
      await d.insert(user).values({
        id: userId,
        name: emp.name,
        email: `${emp.code.toLowerCase()}@absen.garage.local`,
      });
    }

    const [profile] = await d
      .select()
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, userId))
      .limit(1);
    const pin = !profile?.pinHash || resetPin ? generateAbsenPin(takenPins) : null;

    if (!profile) {
      await d.insert(staffProfiles).values({
        userId,
        outletId: outlet.id,
        role: emp.role,
        position: emp.position,
        division: "Payroll",
        shiftLabel: "Absen HP (bukan akun sistem)",
        deviceLabel: "ABSEN-HP",
        status: "active",
        pinHash: pin ? hashPin(pin) : null,
      });
    } else if (pin) {
      await d
        .update(staffProfiles)
        .set({ pinHash: hashPin(pin), updatedAt: now })
        .where(eq(staffProfiles.userId, userId));
    }

    const [wage] = await d
      .select()
      .from(staffWageConfig)
      .where(eq(staffWageConfig.staffUserId, userId))
      .limit(1);
    const wageValues = {
      monthlySalary: emp.monthlySalary,
      dailyWage,
      overtimeHourly: OVERTIME_HOURLY,
      excludeFromFee: emp.excludeFromFee ?? false,
      shiftStartMinutes: emp.shiftStartMinutes ?? null,
    };
    if (!wage) {
      await d.insert(staffWageConfig).values({ staffUserId: userId, ...wageValues, absenCode: emp.code });
    } else {
      // Karyawan sudah ada: jangan timpa perubahan owner dari layar Kelola Karyawan.
      // Cukup lengkapi yang kosong; timpa semua hanya dengan --reset-wage.
      await d
        .update(staffWageConfig)
        .set({
          ...(resetWage ? wageValues : {}),
          ...(!resetWage && wage.monthlySalary === null && wage.dailyWage === dailyWage
            ? { monthlySalary: emp.monthlySalary }
            : {}),
          absenCode: wage.absenCode ?? emp.code,
          updatedAt: now,
        })
        .where(eq(staffWageConfig.staffUserId, userId));
    }

    report.push({
      kode: emp.code,
      nama: emp.name,
      "gaji/hari": `Rp ${(wage && !resetWage ? wage.dailyWage : dailyWage).toLocaleString("id-ID")}`,
      fee: emp.excludeFromFee ? "tidak" : "ya",
      masuk: emp.shiftStartMinutes
        ? `${String(Math.floor(emp.shiftStartMinutes / 60)).padStart(2, "0")}:${String(emp.shiftStartMinutes % 60).padStart(2, "0")}`
        : "09:00",
      PIN: pin ?? "(tidak diubah)",
    });
  }

  if (!skipSettings) {
    const merge = async (key: string, patch: Record<string, unknown>) => {
      const current = ((await getPayrollSetting(key)) ?? {}) as Record<string, unknown>;
      await setPayrollSetting(key, { ...current, ...patch });
    };
    // Aturan gaji Garage (lihat memory payroll-v2-garage-rules).
    await merge("general", {
      openHour: 9,
      closeHour: 23,
      requireMinCheckout: false,
      weeklyOffDays: [], // toko buka setiap hari
    });
    await merge("late.penalty", { mode: "per_minute", perMinute: 1_000, cutoffMinutes: 30 });
    await merge("overtime", {
      enabled: true,
      startHour: 23,
      startMinute: 0,
      autoFromWage: false,
      flatHourlyRate: OVERTIME_HOURLY,
      paidWeekdays: [6], // Sabtu saja
      roundMode: "hour",
    });
    await merge("fee.pool", { enabled: true, perProduct: 100, splitMode: "per_head" });
    await merge("bonus.attendance", {
      enabled: true,
      amount: 50_000,
      allowLateOnce: false,
      lateGraceMinutes: 0,
      allowedOffDays: 2,
    });
    await merge("attendance.methods", { absen: "pin_selfie_gps" });
  }

  console.table(report);
  console.log(
    skipSettings
      ? "Aturan gaji TIDAK diubah (--no-settings)."
      : "Aturan gaji Garage aktif: potong Rp1.000/mnt, hangus telat >=30 mnt, lembur Sabtu Rp3.000/jam, fee Rp100/produk per kepala, bonus Rp50.000 (libur maks 2x/bln).",
  );
  console.log("Catat PIN di atas sekarang — PIN tidak disimpan dalam bentuk asli.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Jangan sentuh DB bila skrip berhenti sebelum membukanya (mis. server masih hidup).
    if (!dbOpened) return;
    const { getPgPool } = await import("@/db");
    const client = getPgPool() as { end?: () => Promise<void>; close?: () => Promise<void> };
    if (typeof client.end === "function") await client.end();
    else if (typeof client.close === "function") await client.close();
  });

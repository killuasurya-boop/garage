import { getDb, ensureDatabaseReady, getPgPool } from "../db/index";
import { staffProfiles, user, employeeAttendances, staffAdvances, staffTasks, staffPayrolls } from "../db/schema";
import { and, eq } from "drizzle-orm";

async function main() {
  console.log("=== MEMULAI SIMULASI OPERASIONAL STAF (UAT) ===");
  await ensureDatabaseReady();
  const db = await getDb();

  // 1. Dapatkan Kasir aktif untuk simulasi
  const kasirStaff = await db
    .select({
      id: staffProfiles.id,
      userId: staffProfiles.userId,
      name: user.name,
      outletId: staffProfiles.outletId,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(staffProfiles.userId, user.id))
    .where(eq(staffProfiles.role, "Kasir"))
    .limit(1)
    .then((rows) => rows[0]);

  if (!kasirStaff) {
    console.error("Gagal menjalankan simulasi: Karyawan dengan peran Kasir tidak ditemukan.");
    process.exit(1);
  }

  console.log(`\n[Simulasi 1] Karyawan terpilih untuk simulasi: ${kasirStaff.name} (ID: ${kasirStaff.id})`);

  // 2. Simulasikan Absen Masuk (Clock In)
  console.log("\n[Simulasi 2] Mencatat absensi Clock In...");
  const [attendance] = await db
    .insert(employeeAttendances)
    .values({
      staffId: kasirStaff.id,
      outletId: kasirStaff.outletId,
      action: "in",
    })
    .returning();
  console.log(`OK: Absensi Clock In tercatat pada: ${attendance.timestamp.toISOString()}`);

  // 3. Simulasikan Pengajuan Kasbon & Persetujuannya
  console.log("\n[Simulasi 3] Mengajukan kasbon sebesar Rp150.000...");
  const [advance] = await db
    .insert(staffAdvances)
    .values({
      staffId: kasirStaff.id,
      period: "2026-05",
      amount: 150000,
      reason: "Beli oli motor mendesak",
      status: "pending",
    })
    .returning();
  console.log(`OK: Kasbon diajukan dengan status: ${advance.status}`);

  console.log("Simulasikan Owner menyetujui kasbon...");
  const [approvedAdvance] = await db
    .update(staffAdvances)
    .set({
      status: "approved",
      approvedBy: kasirStaff.userId, // Disetujui oleh user bersangkutan sebagai contoh
      updatedAt: new Date(),
    })
    .where(eq(staffAdvances.id, advance.id))
    .returning();
  console.log(`OK: Status kasbon diperbarui menjadi: ${approvedAdvance.status}`);

  // 4. Simulasikan Pendelegasian Tugas
  console.log("\n[Simulasi 4] Membuat tugas baru 'Bongkar & Dialing Espresso Mesin'...");
  const [task] = await db
    .insert(staffTasks)
    .values({
      targetRole: "Kasir",
      title: "Bongkar & Dialing Espresso Mesin",
      detail: "Bersihkan sisa bubuk kopi dan kalibrasi ulang grind size espresso.",
      priority: "high",
      status: "open",
      source: "manual",
      createdBy: kasirStaff.userId,
    })
    .returning();
  console.log(`OK: Tugas terdelegasikan dengan status: ${task.status}`);

  console.log("Simulasikan Kasir menyelesaikan tugas tersebut...");
  const [completedTask] = await db
    .update(staffTasks)
    .set({
      status: "done",
      completedAt: new Date(),
      completedBy: kasirStaff.userId,
      updatedAt: new Date(),
    })
    .where(eq(staffTasks.id, task.id))
    .returning();
  console.log(`OK: Status tugas berhasil diperbarui menjadi: ${completedTask.status} pada ${completedTask.completedAt?.toISOString()}`);

  // 5. Verifikasi Integrasi Payroll Bulan Mei 2026
  console.log("\n[Simulasi 5] Melakukan kalkulasi integrasi payroll Gaji & Payroll Mei 2026...");
  
  // Dapatkan seluruh kasbon disetujui untuk kasirStaff ini di Mei 2026
  const advances = await db
    .select()
    .from(staffAdvances)
    .where(
      and(
        eq(staffAdvances.staffId, kasirStaff.id),
        eq(staffAdvances.period, "2026-05"),
        eq(staffAdvances.status, "approved")
      )
    );

  const totalDeductions = advances.reduce((acc, cur) => acc + cur.amount, 0);
  console.log(`-> Total kasbon terdeteksi bulan ini: Rp${totalDeductions.toLocaleString("id-ID")}`);

  const baseSalary = 3200000;
  const allowance = 300000;
  const bonus = 250000; // Bonus performa
  const netSalary = (baseSalary + allowance + bonus) - totalDeductions;

  console.log(`-> Rincian Slip Gaji Mei 2026 untuk ${kasirStaff.name}:`);
  console.log(`   Gaji Pokok: Rp${baseSalary.toLocaleString("id-ID")}`);
  console.log(`   Tunjangan : Rp${allowance.toLocaleString("id-ID")}`);
  console.log(`   Bonus KPI : Rp${bonus.toLocaleString("id-ID")}`);
  console.log(`   Potongan  : Rp${totalDeductions.toLocaleString("id-ID")} (Kasbon otomatis)`);
  console.log(`   Gaji Bersih: Rp${netSalary.toLocaleString("id-ID")}`);

  // Simpan record payroll ke database
  const [payroll] = await db
    .insert(staffPayrolls)
    .values({
      staffId: kasirStaff.id,
      period: "2026-05",
      baseSalary,
      allowance,
      bonus,
      deduction: totalDeductions,
      netSalary,
      status: "draft",
    })
    .returning();

  console.log(`\nOK: Slip gaji draf bulanan telah disimpan ke database (ID: ${payroll.id})`);
  console.log("=== SIMULASI UAT SELESAI DENGAN SUKSES ===");

  // Close PGlite
  const pool = getPgPool();
  if ("end" in pool && typeof pool.end === "function") {
    await pool.end();
  } else if ("close" in pool && typeof (pool as { close?: () => Promise<void> }).close === "function") {
    await (pool as { close: () => Promise<void> }).close();
  }
}

main().catch(console.error);

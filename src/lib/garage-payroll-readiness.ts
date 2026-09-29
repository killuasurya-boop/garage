// Payroll V2 — cek kesiapan operasional: satu daftar yang menunjukkan apa yang
// sudah beres dan apa yang belum sebelum absen & gajian dipakai sungguhan.

import fs from "node:fs";
import path from "node:path";

import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  payrollSettings,
  staffAttendanceV2,
  staffPayoutRequests,
  staffProfiles,
  staffWageConfig,
  user,
} from "@/db/schema";
import { jakartaDateKey } from "@/lib/attendance";
import { listBackups, offsiteDir, readOffsiteStatus } from "@/lib/garage-db-backup";
import { getExpenseApprovalThreshold } from "@/lib/finance-control";
import {
  PAYROLL_DEFAULTS,
  PAYROLL_KEYS,
  getPayrollSetting,
  isPayrollV2Enabled,
} from "@/lib/garage-payroll-settings";
import { getUnfinalizedDates } from "@/lib/garage-payroll-payments";

export type ReadinessStatus = "ok" | "warn" | "todo";

export interface ReadinessItem {
  key: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  action?: { label: string; href: string };
}

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(n)}`;
const DAY_MS = 86_400_000;

export async function getPayrollReadiness(now = new Date()): Promise<{ ready: boolean; items: ReadinessItem[] }> {
  const db = getDb();
  const settingsUrl = "/owner/payroll/settings";
  const items: ReadinessItem[] = [];

  // 1. Flag
  items.push(
    isPayrollV2Enabled()
      ? { key: "flag", label: "Payroll V2 aktif", status: "ok", detail: "Halaman absen & gajian terbuka." }
      : {
          key: "flag",
          label: "Payroll V2 aktif",
          status: "todo",
          detail: "Set PAYROLL_V2_ENABLED=true di .env.local lalu nyalakan ulang server.",
        },
  );

  const stored = await db
    .select({ key: payrollSettings.key, value: payrollSettings.value })
    .from(payrollSettings)
    .where(inArray(payrollSettings.key, [PAYROLL_KEYS.gps, "late.penalty", PAYROLL_KEYS.feePool, PAYROLL_KEYS.bonusAttendance]));
  const setting = (key: string) => stored.find((s) => s.key === key)?.value as Record<string, unknown> | undefined;

  // 2. GPS toko
  const gps = setting(PAYROLL_KEYS.gps) as { lat?: number; lng?: number; radiusMeters?: number } | undefined;
  const placeholder = PAYROLL_DEFAULTS[PAYROLL_KEYS.gps] as { lat: number; lng: number };
  if (!gps || (gps.lat === placeholder.lat && gps.lng === placeholder.lng)) {
    items.push({
      key: "gps",
      label: "Lokasi GPS toko",
      status: "todo",
      detail: "Masih titik contoh — semua absen akan ditolak \"di luar radius\". Buka Pengaturan dari HP di toko, tekan \"Pakai Lokasi Saya\", lalu simpan.",
      action: { label: "Atur GPS", href: settingsUrl },
    });
  } else {
    const radius = gps.radiusMeters ?? 50;
    items.push({
      key: "gps",
      label: "Lokasi GPS toko",
      status: radius < 30 ? "warn" : "ok",
      detail:
        radius < 30
          ? `Tersimpan (${gps.lat?.toFixed(5)}, ${gps.lng?.toFixed(5)}), tapi radius ${radius} m terlalu ketat — GPS HP bisa meleset 20–50 m. Disarankan 50–100 m.`
          : `Tersimpan (${gps.lat?.toFixed(5)}, ${gps.lng?.toFixed(5)}), radius ${radius} m.`,
      action: { label: "Lihat peta", href: settingsUrl },
    });
  }

  // 3. Aturan gaji Garage
  const late = setting("late.penalty") as { mode?: string; perMinute?: number; cutoffMinutes?: number } | undefined;
  const fee = setting(PAYROLL_KEYS.feePool) as { splitMode?: string; perProduct?: number } | undefined;
  const bonus = setting(PAYROLL_KEYS.bonusAttendance) as { enabled?: boolean; amount?: number } | undefined;
  const rulesOk = late?.mode === "per_minute" && fee?.splitMode === "per_head" && bonus?.enabled === true;
  items.push({
    key: "rules",
    label: "Aturan gaji Garage",
    status: rulesOk ? "ok" : "todo",
    detail: rulesOk
      ? `Telat ${rp(late?.perMinute ?? 0)}/menit (hangus ≥${late?.cutoffMinutes ?? 30} mnt), fee ${rp(fee?.perProduct ?? 0)}/produk per kepala, bonus ${rp(bonus?.amount ?? 0)}.`
      : "Aturan belum terpasang lengkap. Jalankan: npm run payroll:seed (saat server mati).",
  });

  // 4. Karyawan absen
  const employees = await db
    .select({
      staffUserId: staffWageConfig.staffUserId,
      name: user.name,
      monthlySalary: staffWageConfig.monthlySalary,
      dailyWage: staffWageConfig.dailyWage,
      pinHash: staffProfiles.pinHash,
      status: staffProfiles.status,
    })
    .from(staffWageConfig)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, staffWageConfig.staffUserId))
    .innerJoin(user, eq(user.id, staffWageConfig.staffUserId))
    .where(isNotNull(staffWageConfig.absenCode));
  const active = employees.filter((e) => e.status === "active");
  const noPin = active.filter((e) => !e.pinHash).length;
  const noSalary = active.filter((e) => !(e.monthlySalary ?? 0) && !(e.dailyWage ?? 0)).length;
  items.push({
    key: "employees",
    label: "Karyawan & PIN absen",
    status: active.length === 0 || noPin > 0 || noSalary > 0 ? "todo" : "ok",
    detail:
      active.length === 0
        ? "Belum ada karyawan absen aktif."
        : noPin > 0 || noSalary > 0
          ? `${active.length} aktif — ${noPin} belum punya PIN, ${noSalary} belum ada gaji. Reset PIN / isi gaji di Karyawan Absen.`
          : `${active.length} karyawan aktif, semua punya PIN & gaji. Pastikan PIN sudah dibagikan ke masing-masing.`,
    action: { label: "Karyawan Absen", href: "/owner/payroll/employees" },
  });

  // 5. Akses HP (HTTPS untuk kamera & GPS)
  const certDir = path.join(process.cwd(), "certs", "absen");
  const hasCert = fs.existsSync(certDir) && fs.readdirSync(certDir).some((f) => f.endsWith(".pem") || f.endsWith(".crt"));
  items.push({
    key: "https",
    label: "Akses absen dari HP (HTTPS)",
    status: hasCert ? "ok" : "warn",
    detail: hasCert
      ? "Sertifikat sudah dibuat. Saat operasional jalankan juga: npm run absen:https (HP buka https://<IP-laptop>:3443/absen)."
      : "Kamera & GPS HP butuh HTTPS. Jalankan: npm run absen:https, lalu buka https://<IP-laptop>:3443/absen dari HP.",
  });

  // 6. Uji coba absen
  const since = jakartaDateKey(new Date(now.getTime() - 14 * DAY_MS));
  const ids = active.map((e) => e.staffUserId);
  const [trial] = ids.length
    ? await db
        .select({
          valid: sql<number>`COUNT(*) FILTER (WHERE ${staffAttendanceV2.status} = 'valid')`,
          people: sql<number>`COUNT(DISTINCT ${staffAttendanceV2.staffUserId}) FILTER (WHERE ${staffAttendanceV2.status} = 'valid')`,
          total: sql<number>`COUNT(*)`,
        })
        .from(staffAttendanceV2)
        .where(and(inArray(staffAttendanceV2.staffUserId, ids), gte(staffAttendanceV2.date, since)))
    : [{ valid: 0, people: 0, total: 0 }];
  const valid = Number(trial?.valid ?? 0);
  items.push({
    key: "trial",
    label: "Uji coba absen (14 hari terakhir)",
    status: valid > 0 ? "ok" : "todo",
    detail:
      valid > 0
        ? `${valid} absen valid dari ${Number(trial?.people ?? 0)} karyawan.`
        : Number(trial?.total ?? 0) > 0
          ? "Sudah ada absen masuk, tapi belum ada yang lengkap (masuk + keluar). Uji satu shift penuh."
          : "Belum ada absen. Minta 1–2 karyawan absen masuk & keluar dari HP di toko.",
    action: { label: "Absen Hari Ini", href: "/owner/payroll/today" },
  });

  // 7. Hari belum final
  const pending = await getUnfinalizedDates(jakartaDateKey(now), now);
  items.push({
    key: "pending",
    label: "Hitungan tertunda",
    status: pending.length === 0 ? "ok" : "warn",
    detail:
      pending.length === 0
        ? "Semua hari sudah final."
        : `${pending.length} hari belum final (belum check-out / belum lewat jam 10:00 esok harinya). Koreksi yang lupa check-out.`,
    action: pending.length ? { label: "Koreksi absen", href: "/owner/payroll/today" } : undefined,
  });

  // 8. Batas approval vs gaji
  const threshold = await getExpenseApprovalThreshold();
  const maxMonthly = Math.max(0, ...active.map((e) => e.monthlySalary ?? (e.dailyWage ?? 0) * 30));
  items.push({
    key: "approval",
    label: "Batas persetujuan pengeluaran",
    status: maxMonthly >= threshold ? "warn" : "ok",
    detail:
      maxMonthly >= threshold
        ? `Batas ${rp(threshold)} ≤ gaji bulanan terbesar ${rp(maxMonthly)} — gajian bulanan akan menunggu persetujuan di Approvals dulu. Tidak apa bila memang diinginkan; naikkan batas bila tidak.`
        : `Batas ${rp(threshold)} — gajian bulanan langsung tercatat.`,
    action: { label: "Pengaturan Keuangan", href: "/control/financial/settings" },
  });

  // 8b. UMK — angka resmi diisi Owner; sistem hanya membandingkan.
  const umk = (await getPayrollSetting(PAYROLL_KEYS.umk)) as { amount?: number; region?: string; year?: number } | null;
  const umkAmount = Math.max(0, umk?.amount ?? 0);
  if (umkAmount <= 0) {
    items.push({
      key: "umk",
      label: "Upah minimum (UMK)",
      status: "warn",
      detail: `Nilai UMK ${umk?.region ?? ""} ${umk?.year ?? ""} belum diisi. Isi angka resmi dari SK/Disnaker di Pengaturan → UMK agar gaji di bawah UMK terdeteksi.`,
      action: { label: "Isi UMK", href: settingsUrl },
    });
  } else {
    const below = employees
      .filter((e) => e.status === "active")
      .map((e) => ({ name: e.name, salary: e.monthlySalary ?? (e.dailyWage ?? 0) * 30 }))
      .filter((e) => e.salary < umkAmount);
    items.push({
      key: "umk",
      label: "Upah minimum (UMK)",
      status: below.length ? "warn" : "ok",
      detail: below.length
        ? `${below.length} karyawan bergaji di bawah UMK ${rp(umkAmount)}: ${below
            .map((b) => `${b.name} (${rp(b.salary)})`)
            .join(", ")}. Konsultasikan ke Disnaker / konsultan ketenagakerjaan.`
        : `Semua gaji bulanan ≥ UMK ${umk?.region ?? ""} ${rp(umkAmount)}.`,
      action: below.length ? { label: "Karyawan Absen", href: "/owner/payroll/employees" } : undefined,
    });
  }

  // 9. Permintaan payout lama (alur ditutup) yang masih menunggu
  const [legacy] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(staffPayoutRequests)
    .where(eq(staffPayoutRequests.status, "pending"));
  const legacyPending = Number(legacy?.n ?? 0);
  if (legacyPending > 0) {
    items.push({
      key: "legacy-payout",
      label: "Permintaan payout lama",
      status: "warn",
      detail: `${legacyPending} permintaan dari alur lama masih menunggu. Alur itu sudah ditutup — bayar lewat Gajian & Kasbon, lalu tutup permintaannya.`,
      action: { label: "Payout Lama", href: "/owner/payroll/requests" },
    });
  }

  // 10. Backup
  const [last] = await listBackups();
  const ageH = last ? (now.getTime() - new Date(last.createdAt).getTime()) / 3_600_000 : Infinity;
  items.push({
    key: "backup",
    label: "Backup data",
    status: ageH <= 36 ? "ok" : "warn",
    detail: last
      ? `Terakhir ${Math.round(ageH)} jam lalu (${last.file}). Otomatis sekali sehari & sebelum gajian.`
      : "Belum ada backup. Tekan \"Backup sekarang\" di halaman Gajian.",
    action: { label: "Gajian & Backup", href: "/owner/payroll/pay" },
  });

  // 11. Salinan backup di luar laptop
  const [copyDir, offsite] = await Promise.all([offsiteDir(), readOffsiteStatus()]);
  items.push(
    !copyDir
      ? {
          key: "offsite",
          label: "Salinan backup di luar laptop",
          status: "warn",
          detail:
            "Backup hanya ada di laptop ini — hilang bila laptop rusak/dicuri. Atur folder Google Drive/flashdisk di Pengaturan → Salinan Backup.",
          action: { label: "Atur salinan", href: settingsUrl },
        }
      : offsite && !offsite.ok && offsite.dir === copyDir
        ? {
            key: "offsite",
            label: "Salinan backup di luar laptop",
            status: "warn",
            detail: `Salinan terakhir ke ${copyDir} GAGAL: ${offsite.error}`,
            action: { label: "Backup sekarang", href: "/owner/payroll/pay" },
          }
        : {
            key: "offsite",
            label: "Salinan backup di luar laptop",
            status: "ok",
            detail: offsite?.ok
              ? `Disalin ke ${copyDir} (${offsite.file}).`
              : `Diatur ke ${copyDir} — salinan pertama dibuat pada backup berikutnya.`,
          },
  );

  return { ready: items.every((i) => i.status !== "todo"), items };
}

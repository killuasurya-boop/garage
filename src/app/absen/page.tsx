import type { Metadata } from "next";
import { AbsenV2Panel } from "@/components/payroll/absen-v2-panel";
import { EmployeeClockPanel } from "@/components/garage/employee-clock-panel";
import { isPayrollV2Enabled } from "@/lib/garage-payroll-settings";

export const metadata: Metadata = {
  title: "Absensi | Garage OS",
  description: "Terminal absensi karyawan Garage OS (PIN + Selfie + GPS).",
};

// Satu route absen kanonis (NAV_ACTION_AUDIT §1.3/§1.8). Menyesuaikan sistem yang
// aktif: Payroll V2 (checkin/checkout + wallet) bila flag ON, terminal absensi
// legacy bila OFF — supaya tombol Absen selalu berfungsi di kedua keadaan.
export default function AbsenPage() {
  const v2 = isPayrollV2Enabled();
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4 flex flex-col items-center">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--garage-fg)] tracking-wide">
            GARAGE OS
          </h1>
          <p className="text-xs text-[var(--garage-mute)] uppercase tracking-widest mt-1">
            Absensi Karyawan
          </p>
        </div>
        {v2 ? <AbsenV2Panel /> : <EmployeeClockPanel />}
      </div>
    </main>
  );
}

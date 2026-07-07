import type { Metadata } from "next";
import { GpsSettingsPanel } from "@/components/payroll/gps-settings-panel";
import { WageSettingsPanel } from "@/components/payroll/wage-settings-panel";
import { PayrollSettingsPanel } from "@/components/payroll/payroll-settings-panel";

export const metadata: Metadata = {
  title: "Payroll Settings | Garage OS Owner",
};

export default function PayrollSettingsPage() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--garage-fg)]">Pengaturan Payroll</h1>
          <p className="text-sm text-[var(--garage-mute)] mt-1">
            Atur lokasi absen, upah, fee & aturan lain. Perubahan langsung berlaku
            pada cron finalisasi berikutnya.
          </p>
        </div>

        {/* 1. Lokasi absen (peta) */}
        <GpsSettingsPanel />

        {/* 2. Upah per staff */}
        <WageSettingsPanel />

        {/* 3. Pengaturan lanjutan (JSON per key) */}
        <details className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--garage-fg)]">
            Pengaturan Lanjutan (telat, fee pool, bonus, payout, dll)
          </summary>
          <div className="mt-4">
            <PayrollSettingsPanel />
          </div>
        </details>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { PayrollSettingsPanel } from "@/components/payroll/payroll-settings-panel";

export const metadata: Metadata = {
  title: "Payroll Settings | Garage OS Owner",
};

export default function PayrollSettingsPage() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-[var(--garage-fg)]">Pengaturan Payroll</h1>
        <p className="text-sm text-[var(--garage-mute)]">
          Semua aturan gaji, fee, absensi & bonus bisa diubah di sini. Perubahan
          langsung berlaku pada cron finalisasi berikutnya.
        </p>
        <PayrollSettingsPanel />
      </div>
    </main>
  );
}

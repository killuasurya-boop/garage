import type { Metadata } from "next";
import { PayrollDashboard } from "@/components/payroll/payroll-dashboard";
import { PayrollMonthlyRecap } from "@/components/payroll/payroll-monthly-recap";

export const metadata: Metadata = {
  title: "Rekap & Slip Gaji | Garage OS",
};

export default function PayrollOwnerPage() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-[var(--garage-fg)]">Rekap & Slip Gaji</h1>
        <PayrollDashboard />
        <PayrollMonthlyRecap />
      </div>
    </main>
  );
}

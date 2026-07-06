import type { Metadata } from "next";
import { PayrollDashboard } from "@/components/payroll/payroll-dashboard";

export const metadata: Metadata = {
  title: "Payroll Dashboard | Garage OS Owner",
};

export default function PayrollOwnerPage() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-[var(--garage-fg)]">Payroll Owner</h1>
        <PayrollDashboard />
      </div>
    </main>
  );
}

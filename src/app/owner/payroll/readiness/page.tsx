import type { Metadata } from "next";

import { PayrollReadinessPanel } from "@/components/payroll/payroll-readiness-panel";

export const metadata: Metadata = {
  title: "Cek Kesiapan Payroll | Garage OS",
};

export default function PayrollReadinessPage() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="max-w-6xl mx-auto">
        <PayrollReadinessPanel />
      </div>
    </main>
  );
}

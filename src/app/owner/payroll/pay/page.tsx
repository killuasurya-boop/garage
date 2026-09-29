import type { Metadata } from "next";

import { PayrollPaymentsPanel } from "@/components/payroll/payroll-payments-panel";

export const metadata: Metadata = {
  title: "Gajian & Kasbon | Garage OS",
};

export default function PayrollPayPage() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="max-w-6xl mx-auto">
        <PayrollPaymentsPanel />
      </div>
    </main>
  );
}

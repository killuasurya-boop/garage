import type { Metadata } from "next";

import { PayrollThrPanel } from "@/components/payroll/payroll-thr-panel";

export const metadata: Metadata = {
  title: "THR | Garage OS",
};

export default function PayrollThrPage() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="max-w-6xl mx-auto">
        <PayrollThrPanel />
      </div>
    </main>
  );
}

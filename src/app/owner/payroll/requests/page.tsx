import type { Metadata } from "next";
import { PayoutRequestsPanel } from "@/components/payroll/payout-requests-panel";

export const metadata: Metadata = {
  title: "Payout Requests | Garage OS Owner",
};

export default function PayoutRequestsPage() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-[var(--garage-fg)]">Permintaan Payout</h1>
        <PayoutRequestsPanel />
      </div>
    </main>
  );
}

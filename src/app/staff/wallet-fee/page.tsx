import type { Metadata } from "next";
import { WalletFeePanel } from "@/components/payroll/wallet-fee-panel";

export const metadata: Metadata = {
  title: "Wallet Fee | Garage OS",
};

export default function WalletFeePage() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="w-full max-w-md mx-auto space-y-4">
        <h1 className="text-xl font-bold text-[var(--garage-fg)]">Wallet Fee Saya</h1>
        <WalletFeePanel />
      </div>
    </main>
  );
}

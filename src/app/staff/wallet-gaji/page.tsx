import type { Metadata } from "next";
import { WalletGajiPanel } from "@/components/payroll/wallet-gaji-panel";

export const metadata: Metadata = {
  title: "Wallet Gaji | Garage OS",
};

export default function WalletGajiPage() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="w-full max-w-md mx-auto space-y-4">
        <h1 className="text-xl font-bold text-[var(--garage-fg)]">Wallet Gaji Saya</h1>
        <WalletGajiPanel />
      </div>
    </main>
  );
}

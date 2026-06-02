import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CashierShiftReport } from "@/components/garage/cashier-shift-report";
import { requireGarageSession } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Riwayat Shift Kasir | Garage",
  description: "Riwayat shift kasir, ringkasan penjualan, dan laporan PDF.",
};

// Akses session/DB saat render → opt-out static generation (build tanpa DB live).
export const dynamic = "force-dynamic";

export default async function ShiftPage() {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Admin",
    "Manager Operasional",
    "Supervisor Shift",
    "Kasir",
  ]);
  if (session.response) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-[#08080b] py-6">
      <div className="mx-auto max-w-5xl px-4">
        <CashierShiftReport />
      </div>
    </main>
  );
}

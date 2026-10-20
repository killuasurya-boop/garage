import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CashierShiftReport } from "@/components/garage/cashier-shift-report";
import { canHandleMoney, homeModuleFor } from "@/lib/role-access";
import { requireGarageSession } from "@/lib/server-auth";
import { staffViewport } from "@/lib/staff-viewport";

// Layar staf: zoom dua jari dikunci (lihat src/lib/staff-viewport.ts).
export const viewport = staffViewport;

export const metadata: Metadata = {
  title: "Riwayat Shift Kasir | Garage",
  description: "Riwayat shift kasir, ringkasan penjualan, dan laporan PDF.",
};

// Akses session/DB saat render → opt-out static generation (build tanpa DB live).
export const dynamic = "force-dynamic";

export default async function ShiftPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir"]);
  if (session.response) {
    redirect("/login");
  }
  // Riwayat shift kas hanya untuk pemegang uang (kasir + Owner/Manajer);
  // barista/koki/helper diarahkan ke papan produksi.
  if (!canHandleMoney(session.data.profile)) {
    redirect(`/os?module=${homeModuleFor(session.data.profile.role, session.data.profile.workstation)}`);
  }

  return (
    <main className="min-h-screen bg-[#08080b] py-6">
      <div className="mx-auto max-w-5xl px-4">
        <CashierShiftReport
          blindOpenShift={session.data.profile.role === "Kasir"}
          canSupervise={session.data.profile.role === "Owner" || session.data.profile.role === "Manajer"}
          initialTab={tab && ["active", "history", "sales", "full", "petty", "incident"].includes(tab) ? tab : undefined}
        />
      </div>
    </main>
  );
}

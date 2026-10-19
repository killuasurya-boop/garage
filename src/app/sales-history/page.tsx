import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SalesHistoryView } from "@/components/garage/sales-history";
import { requireGarageSession } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "History Penjualan | Garage",
  description: "Cari order lama, cetak struk ulang, dan kirim invoice PDF.",
};

// Akses session/DB saat render → opt-out static generation (build tanpa DB live).
export const dynamic = "force-dynamic";

export default async function SalesHistoryPage() {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter"]);
  if (session.response) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-[#08080b] py-6">
      <div className="mx-auto max-w-7xl px-4">
        <SalesHistoryView
          canDeleteInvoice={session.data.profile.role === "Owner" || session.data.profile.role === "Manajer"}
        />
      </div>
    </main>
  );
}

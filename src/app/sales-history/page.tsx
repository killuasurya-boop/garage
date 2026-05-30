import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SalesHistoryView } from "@/components/garage/sales-history";
import { requireGarageSession } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "History Penjualan | Garage",
  description: "Cari order lama, cetak struk ulang, dan kirim invoice PDF.",
};

export default async function SalesHistoryPage() {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Admin",
    "Manager Operasional",
    "Supervisor Shift",
    "Kasir",
    "Waiter 1",
    "Waiter 2",
  ]);
  if (session.response) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-[#08080b] py-6">
      <div className="mx-auto max-w-7xl px-4">
        <SalesHistoryView />
      </div>
    </main>
  );
}

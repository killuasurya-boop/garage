import type { Metadata } from "next";
import { WmsActivityLogPanel } from "@/components/wms/wms-activity-log-panel";

export const metadata: Metadata = {
  title: "Log Aktivitas Warehouse | Garage OS",
  description: "Audit siapa melakukan perpindahan stok — filter per staff, jenis aksi, tanggal.",
};

export default function WmsActivityLogPage() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--garage-fg)]">
            Log Aktivitas Warehouse
          </h1>
          <p className="text-sm text-[var(--garage-mute)] mt-1">
            Audit siapa melakukan perpindahan stok. Setiap gerakan tercatat: masuk,
            keluar, transfer, waste, adjustment, internal-out.
          </p>
        </div>
        <WmsActivityLogPanel />
      </div>
    </main>
  );
}

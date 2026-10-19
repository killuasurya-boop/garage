import type { Metadata } from "next";
import { LazyGarageApp } from "@/components/garage/garage-app-loader";
import { requireModulePageAccess } from "@/lib/page-access";
import { staffViewport } from "@/lib/staff-viewport";

// Layar staf: zoom dua jari dikunci (lihat src/lib/staff-viewport.ts).
export const viewport = staffViewport;

export const metadata: Metadata = {
  title: "Garage POS",
  description: "Pintu masuk sistem POS Garage Coffee.",
};

// Akses session/DB saat render → opt-out static generation (build tanpa DB live).
export const dynamic = "force-dynamic";

export default async function PosPage() {
  await requireModulePageAccess("pos");

  return <LazyGarageApp initialModule="pos" />;
}

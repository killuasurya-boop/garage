import type { Metadata } from "next";
import { LazyGarageApp } from "@/components/garage/garage-app-loader";
import { requireModulePageAccess } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Garage POS",
  description: "Pintu masuk sistem POS Garage Coffee & Motor.",
};

// Akses session/DB saat render → opt-out static generation (build tanpa DB live).
export const dynamic = "force-dynamic";

export default async function PosPage() {
  await requireModulePageAccess("pos");

  return <LazyGarageApp initialModule="pos" />;
}

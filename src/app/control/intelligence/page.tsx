import type { Metadata } from "next";

import { LivingIntelligence } from "@/components/ceo/intelligence/LivingIntelligence";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE — Living Intelligence",
  description: "Jaringan modul Garage OS di sekitar AYA: koneksi, kesehatan modul dan aktivitas nyata.",
};

export default function ControlIntelligencePage() {
  return (
    <ControlDashboardRoute next="/control/intelligence">
      <LivingIntelligence />
    </ControlDashboardRoute>
  );
}

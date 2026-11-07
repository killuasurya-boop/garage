import type { Metadata } from "next";

import { DecisionCenter } from "@/components/ceo/decision/DecisionCenter";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE — Owner Decision Center",
  description: "Pusat keputusan Owner: masalah, bukti, analisis, rekomendasi AYA, konsekuensi, pelaksanaan dan verifikasi.",
};

export default function ControlDecisionPage() {
  return (
    <ControlDashboardRoute next="/control/decision">
      <DecisionCenter />
    </ControlDashboardRoute>
  );
}

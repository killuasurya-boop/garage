import type { Metadata } from "next";

import { AiConnectPanel } from "@/components/ceo/ai/AiConnectPanel";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE — AI Connect",
  description: "Sambungkan, verifikasi, dan kendalikan akses ChatGPT ke Garage OS.",
};

export default function ControlAiConnectPage() {
  return (
    <ControlDashboardRoute next="/control/ai-connect">
      <AiConnectPanel />
    </ControlDashboardRoute>
  );
}

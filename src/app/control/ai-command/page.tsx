import type { Metadata } from "next";

import { AiCommandCenter } from "@/components/ceo/ai/AiCommandCenter";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE — AI Command Center",
  description: "Perintah Owner dengan ringkasan, persetujuan, dan bukti — mesin yang sama dengan ChatGPT.",
};

export default function ControlAiCommandPage() {
  return (
    <ControlDashboardRoute next="/control/ai-command">
      <AiCommandCenter />
    </ControlDashboardRoute>
  );
}

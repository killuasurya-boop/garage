import type { Metadata } from "next";

import { AiGovernancePanel } from "@/components/ceo/decision/AiGovernancePanel";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE — AI Governance",
  description: "Tata kelola AYA: mode, batas risiko tool, aturan tetap, operasi dan efektivitas kasus.",
};

export default function ControlAiGovernancePage() {
  return (
    <ControlDashboardRoute next="/control/ai-governance">
      <AiGovernancePanel />
    </ControlDashboardRoute>
  );
}

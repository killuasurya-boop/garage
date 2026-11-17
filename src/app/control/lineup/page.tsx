import { LineupPanel } from "@/components/ceo/lineup/LineupPanel";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlLineupPage() {
  return (
    <ControlDashboardRoute next="/control/lineup">
      <LineupPanel />
    </ControlDashboardRoute>
  );
}

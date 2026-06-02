import RiskPage from "@/app/control/_dashboard/risk/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlRiskPage() {
  return (
    <ControlDashboardRoute next="/control/risk">
      <RiskPage />
    </ControlDashboardRoute>
  );
}

import CompliancePage from "@/app/control/_dashboard/compliance/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlCompliancePage() {
  return (
    <ControlDashboardRoute next="/control/compliance">
      <CompliancePage />
    </ControlDashboardRoute>
  );
}

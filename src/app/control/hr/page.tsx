import HrPage from "@/app/control/_dashboard/hr/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlHrPage() {
  return (
    <ControlDashboardRoute next="/control/hr">
      <HrPage />
    </ControlDashboardRoute>
  );
}

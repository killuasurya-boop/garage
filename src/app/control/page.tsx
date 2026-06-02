import OverviewPage from "@/app/control/_dashboard/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlPage() {
  return (
    <ControlDashboardRoute>
      <OverviewPage />
    </ControlDashboardRoute>
  );
}

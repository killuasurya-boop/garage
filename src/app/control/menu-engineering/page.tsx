import MenuEngineeringPage from "@/app/control/_dashboard/menu-engineering/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlMenuEngineeringPage() {
  return (
    <ControlDashboardRoute next="/control/menu-engineering">
      <MenuEngineeringPage />
    </ControlDashboardRoute>
  );
}

import KitchenOpsPage from "@/app/control/_dashboard/kitchen-ops/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlKitchenOpsPage() {
  return (
    <ControlDashboardRoute next="/control/kitchen-ops">
      <KitchenOpsPage />
    </ControlDashboardRoute>
  );
}

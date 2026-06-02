import InventoryIntelPage from "@/app/control/_dashboard/inventory-intel/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlInventoryIntelPage() {
  return (
    <ControlDashboardRoute next="/control/inventory-intel">
      <InventoryIntelPage />
    </ControlDashboardRoute>
  );
}

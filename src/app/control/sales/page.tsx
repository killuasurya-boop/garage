import SalesPage from "@/app/control/_dashboard/sales/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlSalesPage() {
  return (
    <ControlDashboardRoute next="/control/sales">
      <SalesPage />
    </ControlDashboardRoute>
  );
}

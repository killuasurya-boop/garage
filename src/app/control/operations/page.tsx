import OperationsPage from "@/app/control/_dashboard/operations/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlOperationsPage() {
  return (
    <ControlDashboardRoute next="/control/operations">
      <OperationsPage />
    </ControlDashboardRoute>
  );
}

import CashflowForecastPage from "@/app/control/_dashboard/cashflow/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlCashflowPage() {
  return (
    <ControlDashboardRoute next="/control/cashflow">
      <CashflowForecastPage />
    </ControlDashboardRoute>
  );
}

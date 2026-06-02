import FinancialPage from "@/app/control/_dashboard/financial/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlFinancialPage() {
  return (
    <ControlDashboardRoute next="/control/financial">
      <FinancialPage />
    </ControlDashboardRoute>
  );
}

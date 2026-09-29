import { FinanceClosingPanel } from "@/components/ceo/finance/FinanceClosingPanel";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlFinancialClosingPage() {
  return (
    <ControlDashboardRoute next="/control/financial/closing">
      <FinanceClosingPanel />
    </ControlDashboardRoute>
  );
}

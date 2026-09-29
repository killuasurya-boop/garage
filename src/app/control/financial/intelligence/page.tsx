import { FinanceIntelligencePanel } from "@/components/ceo/finance/FinanceIntelligencePanel";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlFinancialIntelligencePage() {
  return (
    <ControlDashboardRoute next="/control/financial/intelligence">
      <FinanceIntelligencePanel />
    </ControlDashboardRoute>
  );
}

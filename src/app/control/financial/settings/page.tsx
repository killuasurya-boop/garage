import { FinanceSettingsPanel } from "@/components/ceo/finance/FinanceSettingsPanel";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlFinancialSettingsPage() {
  return (
    <ControlDashboardRoute next="/control/financial/settings">
      <FinanceSettingsPanel />
    </ControlDashboardRoute>
  );
}

import ProfitMaxPage from "@/app/control/_dashboard/profitmax/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const metadata = {
  title: "GARAGE ProfitMax | Owner Control",
  description: "Pusat kontrol HPP, margin, pricing, BEP, dan ROI GARAGE.",
};

export const dynamic = "force-dynamic";

export default function ControlProfitMaxPage() {
  return (
    <ControlDashboardRoute next="/control/profitmax">
      <ProfitMaxPage />
    </ControlDashboardRoute>
  );
}

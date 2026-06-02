import CustomersPage from "@/app/control/_dashboard/customers/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlCustomersPage() {
  return (
    <ControlDashboardRoute next="/control/customers">
      <CustomersPage />
    </ControlDashboardRoute>
  );
}

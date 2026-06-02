import OnboardingPage from "@/app/control/_dashboard/onboarding/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlOnboardingPage() {
  return (
    <ControlDashboardRoute next="/control/onboarding">
      <OnboardingPage />
    </ControlDashboardRoute>
  );
}

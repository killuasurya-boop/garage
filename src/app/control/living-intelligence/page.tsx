import { LivingIntelligenceNetwork } from "@/components/garage/living-intelligence-network";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only, demonstration states only. No live data fetch or business mutations. */
export default function LivingIntelligencePreviewPage() {
  return (
    <ControlDashboardRoute next="/control/living-intelligence">
      <div className="mx-auto w-full max-w-[1700px] px-2 py-5 sm:px-4">
        <LivingIntelligenceNetwork demo />
      </div>
    </ControlDashboardRoute>
  );
}

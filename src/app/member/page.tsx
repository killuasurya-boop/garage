import type { Metadata } from "next";
import { SuryaDeveloperCredit } from "@/components/surya/surya-developer-credit";
import { MemberDashboard } from "@/components/garage/member-dashboard";

export const metadata: Metadata = {
  title: "Member Garage - POS CRM",
  description:
    "Halaman khusus member Garage Coffee untuk level, rewards, dan integrasi POS CRM.",
};

export default function MemberPage() {
  return (
    <>
      <MemberDashboard />
      <div className="bg-[#08080a] px-4 py-6 sm:px-8">
        <SuryaDeveloperCredit variant="compact" />
      </div>
    </>
  );
}

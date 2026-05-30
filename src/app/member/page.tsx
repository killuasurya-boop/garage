import type { Metadata } from "next";
import { MemberDashboard } from "@/components/garage/member-dashboard";

export const metadata: Metadata = {
  title: "Member Garage - POS CRM",
  description:
    "Halaman khusus member Garage Coffee & Motor untuk level, rewards, dan integrasi POS CRM.",
};

export default function MemberPage() {
  return <MemberDashboard />;
}

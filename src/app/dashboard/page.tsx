import type { Metadata } from "next";
import { LazyGarageApp } from "@/components/garage/garage-app-loader";
import { requireModulePageAccess } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Garage Dashboard",
  description: "Pintu masuk dashboard operasional Garage Coffee & Motor.",
};

export default async function DashboardPage() {
  await requireModulePageAccess("dashboard");

  return <LazyGarageApp initialModule="dashboard" />;
}

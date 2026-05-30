import type { Metadata } from "next";
import { LazyGarageApp } from "@/components/garage/garage-app-loader";
import { requireModulePageAccess } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Garage POS",
  description: "Pintu masuk sistem POS Garage Coffee & Motor.",
};

export default async function PosPage() {
  await requireModulePageAccess("pos");

  return <LazyGarageApp initialModule="pos" />;
}

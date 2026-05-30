import type { Metadata } from "next";
import { LazyGarageApp } from "@/components/garage/garage-app-loader";
import { modules, type ModuleId } from "@/lib/garage-data";
import { requireModulePageAccess } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Garage Coffee & Motor OS",
  description:
    "Operational OS for Garage Coffee & Motor with POS, inventory, finance, and audit backend.",
};

export default async function GarageOsPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string | string[] }>;
}) {
  const moduleParam = (await searchParams).module;
  const requestedModule = Array.isArray(moduleParam) ? moduleParam[0] : moduleParam;
  const moduleIds = new Set<ModuleId>(modules.map((module) => module.id));
  const initialModule: ModuleId =
    requestedModule && moduleIds.has(requestedModule as ModuleId)
      ? (requestedModule as ModuleId)
      : "dashboard";

  await requireModulePageAccess(initialModule);

  return <LazyGarageApp initialModule={initialModule} />;
}

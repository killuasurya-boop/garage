"use client";

import type { ModuleId, Role } from "@/lib/garage-data";
import { GarageConnectedNav } from "@/components/garage/garage-connected-nav";

/** @deprecated Use GarageConnectedNav with preset="finance" */
export function FinanceConnectedNav({
  role,
  activeModule = "finance",
  onNavigate,
}: {
  role: Role;
  activeModule?: ModuleId;
  onNavigate?: (module: ModuleId) => void;
}) {
  return (
    <GarageConnectedNav
      role={role}
      preset="finance"
      activeModule={activeModule}
      onNavigate={onNavigate}
    />
  );
}

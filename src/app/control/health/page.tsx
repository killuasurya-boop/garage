import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/garage/admin/admin-shell";
import { HealthDashboard } from "@/components/garage/admin/health-dashboard";
import { generateBackupGuide, getSystemHealth } from "@/lib/garage-health-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE — System Health",
  description: "Database health, recent activity, dan production readiness checklist.",
};

export default async function SystemHealthPage() {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) {
    if (session.response.status === 401) {
      redirect("/login?next=%2Fcontrol%2Fhealth");
    }
    redirect("/os?module=dashboard");
  }

  const health = await getSystemHealth();
  const backupGuide = generateBackupGuide();

  return (
    <AdminShell currentPath="/control/health">
      <HealthDashboard initialHealth={health} backupGuide={backupGuide} />
    </AdminShell>
  );
}

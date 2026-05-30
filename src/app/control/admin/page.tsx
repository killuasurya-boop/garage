import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminHub } from "@/components/garage/admin/admin-hub";
import { AdminShell } from "@/components/garage/admin/admin-shell";
import { getSecurityOverview } from "@/lib/garage-security-service";
import { loadSettingsByKeys } from "@/lib/garage-settings-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE — Admin Hub",
  description: "Pusat kontrol admin Garage OS.",
};

export default async function AdminHubPage() {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) {
    if (session.response.status === 401) {
      redirect("/login?next=%2Fcontrol%2Fadmin");
    }
    redirect("/os?module=dashboard");
  }

  // Hard-enforce 2FA policy: kalau policy aktif & user Owner/Admin tapi belum
  // setup 2FA, redirect ke setup page. Setup page itself accessible (gak loop).
  const policy = await loadSettingsByKeys(["securityRequire2faForOwner"]);
  const userIs2faPrivileged =
    session.data.profile.role === "Owner / CEO" ||
    session.data.profile.role === "Admin";
  const userHas2fa = Boolean(
    (session.data.user as { twoFactorEnabled?: boolean }).twoFactorEnabled,
  );
  if (policy["securityRequire2faForOwner"] && userIs2faPrivileged && !userHas2fa) {
    redirect("/control/2fa?enforced=1");
  }

  const overview = await getSecurityOverview();

  return (
    <AdminShell currentPath="/control/admin">
      <AdminHub
        stats={{
          totalStaff: overview.totalStaff,
          activeSessions: overview.activeSessions,
          suspendedAccounts: overview.suspendedAccounts,
          recentAuditCount24h: overview.recentAuditCount24h,
        }}
        currentUser={{
          name: session.data.user.name,
          role: session.data.profile.role,
        }}
      />
    </AdminShell>
  );
}

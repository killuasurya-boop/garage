import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/garage/admin/admin-shell";
import { SecurityCenter } from "@/components/garage/admin/security-center";
import {
  getLoginStats,
  listLoginAttempts,
} from "@/lib/garage-login-attempts-service";
import {
  getSecurityOverview,
  listActiveSessions,
  listSecurityAuditLogs,
} from "@/lib/garage-security-service";
import { loadSettingsByKeys } from "@/lib/garage-settings-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE — Security Center",
  description: "Active sessions, audit log, dan emergency security control.",
};

export default async function SecurityCenterPage() {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) {
    if (session.response.status === 401) {
      redirect("/login?next=%2Fcontrol%2Fsecurity");
    }
    redirect("/os?module=dashboard");
  }

  const [
    overview,
    sessions,
    auditLogs,
    securitySettings,
    loginStats,
    loginAttempts,
  ] = await Promise.all([
    getSecurityOverview(),
    listActiveSessions(50),
    listSecurityAuditLogs({ limit: 100 }),
    loadSettingsByKeys([
      "securitySessionMaxHours",
      "securityIdleLogoutMinutes",
      "securityFailedLoginLockoutCount",
      "securityLockoutDurationMinutes",
      "securityRequire2faForOwner",
    ]),
    getLoginStats(24),
    listLoginAttempts({ limit: 100 }),
  ]);

  return (
    <AdminShell currentPath="/control/security">
      <SecurityCenter
        initialOverview={overview}
        initialSessions={sessions}
        initialAuditLogs={auditLogs}
        securitySettings={securitySettings}
        loginStats={loginStats}
        loginAttempts={loginAttempts}
        currentUserId={session.data.user.id}
      />
    </AdminShell>
  );
}

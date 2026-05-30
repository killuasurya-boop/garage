import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/garage/admin/admin-shell";
import { TwoFactorManager } from "@/components/garage/admin/two-factor-manager";
import { loadSettingsByKeys } from "@/lib/garage-settings-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE — Two-Factor Authentication",
  description: "Aktifkan 2FA TOTP untuk akun Garage anda.",
};

export default async function TwoFactorPage() {
  const session = await requireGarageSession();
  if (session.response) {
    if (session.response.status === 401) {
      redirect("/login?next=%2Fcontrol%2F2fa");
    }
    redirect("/os?module=dashboard");
  }

  const policy = await loadSettingsByKeys(["securityRequire2faForOwner"]);
  const policyRequires2fa = Boolean(policy["securityRequire2faForOwner"]);
  const userIsPrivileged =
    session.data.profile.role === "Owner / CEO" ||
    session.data.profile.role === "Admin";

  return (
    <AdminShell currentPath="/control/2fa">
      <TwoFactorManager
        user={{
          id: session.data.user.id,
          name: session.data.user.name,
          email: session.data.user.email,
          twoFactorEnabled: Boolean(
            (session.data.user as { twoFactorEnabled?: boolean }).twoFactorEnabled,
          ),
        }}
        policyRequires2fa={policyRequires2fa && userIsPrivileged}
        role={session.data.profile.role}
      />
    </AdminShell>
  );
}

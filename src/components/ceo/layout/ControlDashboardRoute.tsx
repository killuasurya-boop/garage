import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { loadSettingsByKeys } from "@/lib/garage-settings-service";
import { requireGarageSession } from "@/lib/server-auth";
import { CeoLayout } from "./Layout";

export async function ControlDashboardRoute({
  children,
  next = "/control",
}: {
  children: ReactNode;
  next?: string;
}) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    if (session.response.status === 401) {
      redirect(`/login?next=${encodeURIComponent(next)}`);
    }
    redirect("/os?module=dashboard");
  }

  // ── 2FA GATE untuk /control/* (Fase 4 Security Hardening) ──
  // Kalau owner policy `securityRequire2faForOwner` aktif dan user belum
  // enable 2FA → paksa setup dulu. Halaman /control/2fa sendiri tidak
  // di-gate (pakai `next === "/control/2fa"` agar user bisa mengaktifkan).
  if (next !== "/control/2fa") {
    const policy = await loadSettingsByKeys(["securityRequire2faForOwner"]);
    const policyRequires2fa = Boolean(policy["securityRequire2faForOwner"]);
    const userHas2fa = Boolean(
      (session.data.user as { twoFactorEnabled?: boolean }).twoFactorEnabled,
    );
    if (policyRequires2fa && !userHas2fa) {
      redirect("/control/2fa?required=1");
    }
  }

  return <CeoLayout>{children}</CeoLayout>;
}

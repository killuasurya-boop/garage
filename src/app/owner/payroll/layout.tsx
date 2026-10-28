import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { PayrollNav } from "@/components/payroll/payroll-nav";
import { MANAGEMENT_ROLES } from "@/lib/role-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Layout bersama semua halaman /owner/payroll: nav shell (Kembali ke Garage OS +
// tab Dashboard/Permintaan/Pengaturan) supaya navigasi payroll lengkap & konsisten.
// Guard server (sensus S0b): peran sama dengan API /api/payroll/* (Owner/Manajer);
// dulu halaman tampil untuk siapa saja dan hanya datanya yang ditolak API.
export default async function PayrollLayout({ children }: { children: ReactNode }) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) {
    redirect(session.response.status === 401 ? "/login?next=/owner/payroll" : "/os");
  }
  if (session.data.profile.passwordResetRequired) {
    redirect("/account/password?required=1");
  }
  return (
    <div className="min-h-screen bg-[var(--garage-bg-0)]">
      <PayrollNav />
      {children}
    </div>
  );
}

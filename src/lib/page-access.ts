import { redirect } from "next/navigation";

import type { ModuleId } from "@/lib/garage-data";
import { loadSettingsByKeys } from "@/lib/garage-settings-service";
import { canAccessModuleAs, homeModuleFor } from "@/lib/role-access";
import { requireGarageSession } from "@/lib/server-auth";

export async function requireModulePageAccess(moduleId: ModuleId) {
  // Panitia diizinkan di sini hanya untuk dialihkan ke Ruang Panitia (bukan login berulang).
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter", "Panitia"]);
  if (session.response) {
    const next = encodeURIComponent(`/os?module=${moduleId}`);
    if (session.response.status === 401) {
      redirect(`/login?next=${next}`);
    }

    redirect(`/login?next=${next}`);
  }

  const role = session.data.profile.role;
  if (role === "Panitia") redirect("/panitia");
  if (session.data.profile.passwordResetRequired) {
    redirect("/account/password?required=1");
  }

  // Kebijakan 2FA wajib (Pengaturan → Keamanan): Owner/Manajer tanpa 2FA
  // diarahkan ke setup sebelum bisa memakai modul mana pun — dulu hanya
  // ditegakkan di Control Center. Halaman /control/2fa tidak memakai
  // helper ini, jadi tidak terjadi redirect berulang.
  if (role === "Owner" || role === "Manajer") {
    const policy = await loadSettingsByKeys(["securityRequire2faForOwner"]);
    const has2fa = Boolean((session.data.user as { twoFactorEnabled?: boolean }).twoFactorEnabled);
    if (policy["securityRequire2faForOwner"] && !has2fa) {
      redirect("/control/2fa?enforced=1");
    }
  }

  if (!canAccessModuleAs(session.data.profile, moduleId)) {
    redirect(`/os?module=${homeModuleFor(role, session.data.profile.workstation)}`);
  }

  return session.data;
}

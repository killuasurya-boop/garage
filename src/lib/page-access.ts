import { redirect } from "next/navigation";

import type { ModuleId } from "@/lib/garage-data";
import { canAccessModule, firstModuleForRole } from "@/lib/role-access";
import { requireGarageSession } from "@/lib/server-auth";

export async function requireModulePageAccess(moduleId: ModuleId) {
  const session = await requireGarageSession();
  if (session.response) {
    const next = encodeURIComponent(`/os?module=${moduleId}`);
    if (session.response.status === 401) {
      redirect(`/login?next=${next}`);
    }

    redirect(`/login?next=${next}`);
  }

  const role = session.data.profile.role;
  if (session.data.profile.passwordResetRequired) {
    redirect("/account/password?required=1");
  }

  if (!canAccessModule(role, moduleId)) {
    redirect(`/os?module=${firstModuleForRole(role)}`);
  }

  return session.data;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/garage/admin/admin-shell";
import { ThemeMarketplace } from "@/components/garage/theme/theme-marketplace";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE — Theme Marketplace",
  description: "Pilih, customize, dan live-preview tema visual Garage OS.",
};

export default async function ThemeMarketplacePage() {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) {
    if (session.response.status === 401) {
      redirect("/login?next=%2Fcontrol%2Fthemes");
    }
    redirect("/os?module=dashboard");
  }

  return (
    <AdminShell currentPath="/control/themes">
      <ThemeMarketplace />
    </AdminShell>
  );
}

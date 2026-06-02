import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CeoLayout } from "@/components/ceo/layout/Layout";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "GARAGE Owner Control",
  description: "Dashboard owner untuk kontrol operasional GARAGE OS.",
};

export default async function ControlDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    if (session.response.status === 401) {
      redirect("/login?next=%2Fcontrol");
    }
    redirect("/os?module=dashboard");
  }

  return <CeoLayout>{children}</CeoLayout>;
}

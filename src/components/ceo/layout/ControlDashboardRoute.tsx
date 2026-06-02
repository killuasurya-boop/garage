import type { ReactNode } from "react";
import { redirect } from "next/navigation";

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

  return <CeoLayout>{children}</CeoLayout>;
}

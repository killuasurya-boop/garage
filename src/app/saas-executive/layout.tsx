import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keputusan Owner (Okt 2026): halaman contoh ini disembunyikan, hanya Owner yang bisa membuka.
export default async function SaasExecutiveLayout({ children }: { children: ReactNode }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) {
    if (session.response.status === 401) {
      redirect("/login?next=%2Fsaas-executive");
    }
    redirect("/os?module=dashboard");
  }

  return children;
}

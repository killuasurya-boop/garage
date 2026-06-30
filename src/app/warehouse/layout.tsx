import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { canUseApi } from "@/lib/role-access";
import { requireGarageSession } from "@/lib/server-auth";
import { listWmsWarehouses } from "@/lib/wms-service";
import { WmsShell } from "@/components/wms/wms-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-wms-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-wms-mono", display: "swap" });

export default async function WarehouseLayout({ children }: { children: ReactNode }) {
  const session = await requireGarageSession();
  if (session.response) {
    redirect("/login?next=/warehouse");
  }
  const role = session.data.profile.role;
  if (session.data.profile.passwordResetRequired) {
    redirect("/account/password?required=1");
  }
  if (!canUseApi(role, "inventory:read")) {
    redirect("/os");
  }

  const warehouses = await listWmsWarehouses();

  return (
    <div className={`${inter.variable} ${mono.variable}`}>
      <WmsShell user={{ name: session.data.user.name, role }} warehouses={warehouses}>
        {children}
      </WmsShell>
    </div>
  );
}

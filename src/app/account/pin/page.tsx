import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PinChangePanel } from "@/components/garage/admin/pin-change-panel";
import { getOwnPinStatus } from "@/lib/admin-user-service";
import { requireGarageSession } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "GARAGE - PIN Persetujuan",
  description: "Atur PIN persetujuan Owner/Manajer.",
};

// Membaca session/DB saat render → jangan di-prerender statis.
export const dynamic = "force-dynamic";

export default async function PinPage() {
  const session = await requireGarageSession();
  if (session.response) {
    redirect("/login?next=%2Faccount%2Fpin");
  }
  const role = session.data.profile.role;
  if (role !== "Owner" && role !== "Manajer") {
    redirect("/os");
  }

  const status = await getOwnPinStatus(session.data.user.id);
  return (
    <PinChangePanel
      name={session.data.user.name}
      role={role}
      pinConfigured={status.pinConfigured}
    />
  );
}

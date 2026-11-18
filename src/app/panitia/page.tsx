import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PanitiaWorkspaceView } from "@/components/garage/events/panitia-workspace";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ruang Panitia — Garage OS", robots: { index: false, follow: false } };

// Ruang Panitia (Owner 17 Nov 2026): akun staf yang ditautkan Owner sebagai panitia event. Hak per jabatan dicek di API.
export default async function PanitiaPage() {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter", "Panitia"]);
  if (session.response) redirect("/login?next=/panitia");
  if (session.data.profile.passwordResetRequired) redirect("/account/password?required=1");
  return (
    <div className="min-h-dvh bg-[var(--garage-bg-1,#0b0b0c)]">
      <PanitiaWorkspaceView />
    </div>
  );
}

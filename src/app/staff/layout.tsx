import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Guard server halaman staf (/staff/wallet-gaji, /staff/wallet-fee): wajib login
// staf. Isi wallet tetap dibatasi per orang oleh API /api/wallet-*.
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const session = await requireGarageSession();
  if (session.response) {
    redirect("/login");
  }
  if (session.data.profile.passwordResetRequired) {
    redirect("/account/password?required=1");
  }
  return children;
}

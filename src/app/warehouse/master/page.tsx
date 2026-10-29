import { Suspense } from "react";
import { redirect } from "next/navigation";

import { WmsMasterData } from "@/components/wms/master/wms-master-data";
import { requireGarageSession } from "@/lib/server-auth";
import { wmsIsElevated } from "@/lib/wms-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Master Data hanya untuk Owner/Manajer (dicek di server, bukan sekadar menu tersembunyi).
// API tulis juga dijaga WMS_ELEVATED_ROLES; Kasir/Waiter tetap bisa lihat stok di Inventory.
export default async function WmsMasterPage() {
  const session = await requireGarageSession();
  if (session.response) redirect("/login?next=/warehouse/master");
  if (!wmsIsElevated(session.data.profile.role)) redirect("/warehouse");

  return (
    <Suspense fallback={<p className="text-[13px] text-[#6B7280]">Memuat master data…</p>}>
      <WmsMasterData canEdit />
    </Suspense>
  );
}

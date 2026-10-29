import { Suspense } from "react";
import { redirect } from "next/navigation";

import { SmartOpname } from "@/components/wms/opname/smart-opname";
import { requireGarageSession } from "@/lib/server-auth";
import { wmsAllowedWarehouseTypes, wmsIsElevated } from "@/lib/wms-access";
import { listWmsWarehouses } from "@/lib/wms-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Peran ditentukan di server; tab Owner/Manajer juga dijaga di setiap API.
export default async function WmsOpnamePage() {
  const session = await requireGarageSession();
  if (session.response) redirect("/login?next=/warehouse/opname");
  const role = session.data.profile.role;
  const warehouses = await listWmsWarehouses({ allowedTypes: wmsAllowedWarehouseTypes(role) });
  return (
    <Suspense fallback={<p className="text-[13px] text-[#6B7280]">Memuat stock opname…</p>}>
      <SmartOpname elevated={wmsIsElevated(role)} warehouses={warehouses.map((w) => ({ id: w.id, name: w.name, type: w.type }))} />
    </Suspense>
  );
}

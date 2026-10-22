import { redirect } from "next/navigation";
import { requireGarageSession } from "@/lib/server-auth";
import { PurchasingPage } from "@/components/wms/replenishment-purchasing";
export default async function Page() {
 const session = await requireGarageSession();
 if(session.response) redirect("/login?next=/warehouse/purchasing");
 const profile=session.data.profile;
 return <PurchasingPage access={{role:profile.role,workstation:profile.workstation,position:profile.position}}/>;
}

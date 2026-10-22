import { redirect } from "next/navigation";
import { requireGarageSession } from "@/lib/server-auth";
import { PreparationPage } from "@/components/wms/replenishment-preparation";
export default async function Page() {
 const session = await requireGarageSession();
 if(session.response) redirect("/login?next=/warehouse/preparation");
 const profile=session.data.profile;
 return <PreparationPage access={{role:profile.role,workstation:profile.workstation,position:profile.position}}/>;
}

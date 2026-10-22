import { redirect } from "next/navigation";
import { requireGarageSession } from "@/lib/server-auth";
import { RequestsPage } from "@/components/wms/replenishment-requests";
export default async function Page() {
 const session = await requireGarageSession();
 if(session.response) redirect("/login?next=/warehouse/requests");
 const profile=session.data.profile;
 return <RequestsPage access={{role:profile.role,workstation:profile.workstation,position:profile.position}}/>;
}

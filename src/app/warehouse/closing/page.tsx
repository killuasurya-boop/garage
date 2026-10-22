import { redirect } from "next/navigation";
import { requireGarageSession } from "@/lib/server-auth";
import { ClosingEditor } from "@/components/wms/replenishment-closing";
export default async function Page() {
 const session = await requireGarageSession();
 if(session.response) redirect("/login?next=/warehouse/closing");
 const profile=session.data.profile;
 return <ClosingEditor access={{role:profile.role,workstation:profile.workstation,position:profile.position}}/>;
}

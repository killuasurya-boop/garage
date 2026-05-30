import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CompanyControlCenter } from "@/components/company-control/company-control-center";
import { getCompanyControlData } from "@/lib/company-control";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "GARAGE CEO Control Center",
  description: "Owner-only company document vault, command center, and management control.",
};

export default async function CompanyControlPage() {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    if (session.response.status === 401) {
      redirect("/login?next=%2Fos%3Fmodule%3Ddashboard");
    }

    redirect("/os?module=dashboard");
  }

  const data = await getCompanyControlData(session.data);

  return <CompanyControlCenter initialData={data} />;
}

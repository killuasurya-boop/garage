import type { Metadata } from "next";

import { RecruitmentPage } from "@/components/garage-recruitment/recruitment-page";
import { listOpenPositions } from "@/lib/garage-recruitment-positions-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Open Hiring Garage Team | Karier di GARAGE Coffee & Motor",
  description:
    "Bergabung bersama GARAGE Coffee & Motor Tebing Tinggi. Lowongan Barista, Cashier, Kitchen Crew, Content Creator, Admin, Supervisor, Store Manager, dan Crew Outlet. Daftar online sekarang.",
  alternates: { canonical: "/recruitment" },
  openGraph: {
    title: "Open Hiring Garage Team",
    description:
      "Karier di GARAGE Coffee & Motor. Tumbuh bersama tim yang disiplin, kreatif, dan berorientasi pelayanan. Daftar online.",
    type: "website",
    locale: "id_ID",
  },
};

export default async function Page() {
  const positions = await listOpenPositions();
  return <RecruitmentPage positions={positions} />;
}

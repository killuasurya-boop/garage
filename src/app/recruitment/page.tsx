import type { Metadata } from "next";

import { RecruitmentPage } from "@/components/garage-recruitment/recruitment-page";
import { RECRUITMENT_POSITIONS } from "@/lib/garage-recruitment-data";
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

const POSITION_LOAD_TIMEOUT_MS = 2500;

async function loadPositionsWithFallback() {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<typeof RECRUITMENT_POSITIONS>((resolve) => {
      timeoutId = setTimeout(() => resolve(RECRUITMENT_POSITIONS), POSITION_LOAD_TIMEOUT_MS);
    });

    return await Promise.race([listOpenPositions(), timeout]);
  } catch (error) {
    console.error("Failed to load recruitment positions, using fallback positions", error);
    return RECRUITMENT_POSITIONS;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export default async function Page() {
  const positions = await loadPositionsWithFallback();
  return <RecruitmentPage positions={positions} />;
}

import type { Metadata } from "next";

import { AyaProblemSolver } from "@/components/ceo/decision/AyaProblemSolver";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE — AYA Problem Solver",
  description: "Investigasi masalah lintas modul berbasis bukti resmi (baca-saja), opsi solusi, keputusan dan verifikasi hasil.",
};

export default function ControlAyaSolverPage() {
  return (
    <ControlDashboardRoute next="/control/aya-solver">
      <AyaProblemSolver />
    </ControlDashboardRoute>
  );
}

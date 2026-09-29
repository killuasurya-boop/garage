import type { Metadata } from "next";

import { AbsenEmployeesManager } from "@/components/payroll/absen-employees-manager";

export const metadata: Metadata = {
  title: "Karyawan Absen | Garage OS",
};

export default function PayrollEmployeesPage() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="max-w-6xl mx-auto">
        <AbsenEmployeesManager />
      </div>
    </main>
  );
}

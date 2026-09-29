import type { Metadata } from "next";

import { AttendanceControlPanel } from "@/components/payroll/attendance-control-panel";

export const metadata: Metadata = {
  title: "Absen Hari Ini | Garage OS",
};

export default function PayrollTodayPage() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4">
      <div className="max-w-6xl mx-auto">
        <AttendanceControlPanel />
      </div>
    </main>
  );
}

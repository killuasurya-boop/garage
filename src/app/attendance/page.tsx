import type { Metadata } from "next";
import { EmployeeClockPanel } from "@/components/garage/employee-clock-panel";

export const metadata: Metadata = {
  title: "Sistem Absensi | Garage",
  description: "Terminal absensi karyawan Garage OS.",
};

export default function AttendancePage() {
  return (
    <main className="min-h-screen bg-[#08080b] py-12 px-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-wide">GARAGE OS</h1>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mt-1">Employee Operations</p>
        </div>
        <EmployeeClockPanel />
      </div>
    </main>
  );
}

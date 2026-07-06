import type { Metadata } from "next";
import { AbsenV2Panel } from "@/components/payroll/absen-v2-panel";

export const metadata: Metadata = {
  title: "Absensi V2 | Garage OS",
  description: "Terminal absensi PIN + Selfie + GPS.",
};

export default function AbsenV2Page() {
  return (
    <main className="min-h-screen bg-[var(--garage-bg-0)] py-6 px-4 flex flex-col items-center">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--garage-fg)] tracking-wide">
            GARAGE OS
          </h1>
          <p className="text-xs text-[var(--garage-mute)] uppercase tracking-widest mt-1">
            Absensi Karyawan
          </p>
        </div>
        <AbsenV2Panel />
      </div>
    </main>
  );
}

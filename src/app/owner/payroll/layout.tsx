import type { ReactNode } from "react";
import { PayrollNav } from "@/components/payroll/payroll-nav";

// Layout bersama semua halaman /owner/payroll: nav shell (Kembali ke Garage OS +
// tab Dashboard/Permintaan/Pengaturan) supaya navigasi payroll lengkap & konsisten.
export default function PayrollLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--garage-bg-0)]">
      <PayrollNav />
      {children}
    </div>
  );
}

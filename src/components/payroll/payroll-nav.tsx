"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, LayoutDashboard, Receipt, Settings } from "lucide-react";

// Nav shell payroll owner (NAV_ACTION_AUDIT §1.1/§1.4): Kembali ke Garage OS +
// tab antar-halaman payroll, supaya sub-halaman tidak lagi dead-end.
const TABS = [
  { href: "/owner/payroll", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/owner/payroll/requests", label: "Permintaan Payout", icon: Receipt, exact: false },
  { href: "/owner/payroll/settings", label: "Pengaturan", icon: Settings, exact: false },
];

export function PayrollNav() {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-20 border-b border-[var(--garage-line)] bg-[var(--garage-bg-1)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5">
        <Link
          href="/os"
          className="flex items-center gap-1.5 rounded-md border border-[var(--garage-line)] bg-[var(--garage-bg-2)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--garage-fg)] hover:bg-[var(--garage-bg-3)]"
          title="Kembali ke Garage OS"
        >
          <ArrowLeft className="size-3.5 text-[var(--garage-primary)]" />
          <span className="hidden sm:inline">Garage OS</span>
        </Link>
        <span className="mx-1 hidden text-[12px] font-bold uppercase tracking-wide text-[var(--garage-mute)] sm:inline">
          Payroll
        </span>
        <nav className="flex flex-1 flex-wrap items-center gap-1">
          {TABS.map((tab) => {
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  active
                    ? "bg-[var(--garage-primary)] text-white"
                    : "text-[var(--garage-dim)] hover:bg-[var(--garage-bg-2)] hover:text-[var(--garage-fg)]"
                }`}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

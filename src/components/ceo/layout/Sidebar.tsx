"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Banknote,
  Boxes,
  Briefcase,
  Building2,
  ChefHat,
  ChevronLeft,
  ClipboardCheck,
  LayoutDashboard,
  Rocket,
  Lock,
  LogOut,
  MessageSquare,
  PiggyBank,
  ReceiptText,
  Settings,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Users2,
  Wrench,
  X,
} from "lucide-react";
import { useDashboard } from "../store/dashboardStore";
import { GlowDot } from "../ui/GlowDot";

const nav = [
  { href: "/control", label: "Ringkasan", icon: LayoutDashboard },
  { href: "/control/onboarding", label: "Onboarding", icon: Rocket },
  { href: "/control/briefing", label: "Briefing", icon: Sparkles },
  { href: "/control/financial", label: "Keuangan", icon: PiggyBank },
  { href: "/control/profitmax", label: "ProfitMax", icon: ReceiptText },
  { href: "/control/cashflow", label: "Cash Flow", icon: Banknote },
  { href: "/control/cash-closing", label: "Cash Closing", icon: Lock },
  { href: "/control/sales", label: "Penjualan", icon: TrendingUp },
  { href: "/control/menu-engineering", label: "Menu Eng.", icon: ChefHat },
  { href: "/control/kitchen-ops", label: "Kitchen Ops", icon: ChefHat },
  { href: "/control/inventory-intel", label: "Inventory", icon: Boxes },
  { href: "/control/branches", label: "Cabang", icon: Building2 },
  { href: "/control/operations", label: "Operasional", icon: Wrench },
  { href: "/control/hr", label: "Tim", icon: Users2 },
  { href: "/control/customers", label: "Pelanggan", icon: Users },
  { href: "/control/risk", label: "Risiko", icon: ShieldAlert },
  { href: "/control/compliance", label: "Compliance", icon: ClipboardCheck },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageSquare },
];

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useDashboard();
  const pathname = usePathname();

  return (
    <>
      {/* Mobile drawer overlay */}
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Tutup menu"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}
      <motion.aside
        animate={{ width: sidebarCollapsed ? 72 : 244 }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        className={`h-screen shrink-0 flex-col border-r border-white/10 bg-[var(--garage-bg-1)] md:sticky md:top-0 md:z-30 md:flex ${
          mobileNavOpen
            ? "fixed inset-y-0 left-0 z-50 flex !w-[244px]"
            : "hidden"
        }`}
      >
      <div className={`flex items-center gap-3 border-b border-white/10 px-4 py-4 ${sidebarCollapsed ? "justify-center px-2" : ""}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--garage-red)_22%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--garage-red)_55%,transparent)]">
          <Briefcase className="h-5 w-5 text-[#ffb1b1]" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0 flex-1">
            <p className="font-[var(--garage-font-display)] text-sm font-black uppercase text-zinc-50">
              GARAGE Control
            </p>
            <p className="flex items-center gap-1.5 text-[10px] uppercase text-zinc-400">
              <GlowDot tone="success" /> Live
            </p>
          </div>
        )}
        {/* Tombol tutup khusus mobile drawer */}
        {mobileNavOpen && (
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="rounded-md p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 md:hidden"
            aria-label="Tutup menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/control" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileNavOpen(false)}
              title={sidebarCollapsed ? item.label : undefined}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold uppercase transition ${
                active
                  ? "bg-[color-mix(in_srgb,var(--garage-red)_18%,transparent)] text-zinc-50"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
              } ${sidebarCollapsed ? "justify-center" : ""}`}
            >
              {active ? (
                <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--garage-red-bright)] shadow-[0_0_12px_color-mix(in_srgb,var(--garage-red-bright)_70%,transparent)]" />
              ) : null}
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#ffb1b1]" : ""}`} />
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-2">
        <button
          onClick={toggleSidebar}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold uppercase text-zinc-400 hover:bg-white/5 hover:text-zinc-100 ${sidebarCollapsed ? "justify-center" : ""}`}
        >
          <ChevronLeft className={`h-3.5 w-3.5 transition ${sidebarCollapsed ? "rotate-180" : ""}`} />
          {!sidebarCollapsed && "Sembunyikan"}
        </button>
        <div className={`mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-2 ${sidebarCollapsed ? "justify-center" : ""}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#c41a1a] to-[#7a0f0f] text-[11px] font-bold text-white">
            CE
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-zinc-100">Owner GARAGE</p>
              <p className="truncate text-[10px] text-zinc-400">control@garage.id</p>
            </div>
          )}
          {!sidebarCollapsed && (
            <div className="flex items-center gap-1">
              <button className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100">
                <Settings className="h-3.5 w-3.5" />
              </button>
              <button className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.aside>
    </>
  );
}

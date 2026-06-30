"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Bell,
  BookOpen,
  ChefHat,
  ChevronDown,
  ClipboardCheck,
  Coffee,
  Command,
  FileBarChart,
  Factory,
  LayoutDashboard,
  Menu,
  Package,
  PanelLeft,
  ScanLine,
  Settings,
  ShoppingCart,
  Sliders,
  Sparkles,
  Thermometer,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";

import type { WmsWarehouse } from "@/lib/wms-types";

// Shell desain GARAGE WMS (README §5/§8). Tema light di-scope di sini; tidak
// memakai token gelap Garage OS. Sidebar graphite collapsible, header 60px.

type NavItem = { label: string; href?: string; icon: typeof Package; soon?: boolean };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", href: "/warehouse", icon: LayoutDashboard },
      { label: "Inventory", href: "/warehouse/inventory", icon: Package },
      { label: "Scan Barcode", icon: ScanLine, soon: true },
      { label: "Receiving", href: "/warehouse/receiving", icon: Truck },
      { label: "Transfer", icon: ArrowLeftRight, soon: true },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Internal Order", href: "/warehouse/internal-order", icon: ShoppingCart },
      { label: "Kitchen", icon: ChefHat, soon: true },
      { label: "Bar", icon: Coffee, soon: true },
      { label: "Recipe", icon: BookOpen, soon: true },
      { label: "Production", icon: Factory, soon: true },
    ],
  },
  {
    title: "Control",
    items: [
      { label: "Stock Opname", icon: ClipboardCheck, soon: true },
      { label: "Adjustment", icon: Sliders, soon: true },
      { label: "Reports", icon: FileBarChart, soon: true },
      { label: "Keuangan & HPP", icon: Wallet, soon: true },
    ],
  },
  {
    title: "Smart 2026",
    items: [
      { label: "Smart Reorder", icon: Sparkles, soon: true },
      { label: "Cold Chain", icon: Thermometer, soon: true },
      { label: "Owner Analytics", icon: TrendingUp, soon: true },
    ],
  },
  { title: "System", items: [{ label: "Settings", icon: Settings, soon: true }] },
];

export function WmsShell({
  user,
  warehouses,
  children,
}: {
  user: { name: string; role: string };
  warehouses: WmsWarehouse[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [activeWh, setActiveWh] = useState(
    warehouses.find((w) => w.isPrimary)?.id ?? warehouses[0]?.id ?? "",
  );
  const [whOpen, setWhOpen] = useState(false);
  const wh = warehouses.find((w) => w.id === activeWh);

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      style={{ fontFamily: "var(--font-wms-sans), Inter, system-ui, sans-serif" }}
      className="flex min-h-screen bg-[#F8F9FB] text-[#111111]"
    >
      {/* Sidebar */}
      <aside
        className="relative flex shrink-0 flex-col bg-[#2F3136] text-white transition-[width] duration-300"
        style={{ width: collapsed ? 64 : 240, transitionTimingFunction: "cubic-bezier(.22,1,.36,1)" }}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-[#C8102E]" />
        {/* Logo */}
        <div className="flex h-[60px] items-center gap-2 px-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#C8102E] text-sm font-extrabold">
            G
          </span>
          {!collapsed && (
            <span className="leading-tight">
              <span className="block text-sm font-extrabold tracking-wide">GARAGE</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                WMS · Back Office
              </span>
            </span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-3 [scrollbar-width:thin]">
          {NAV.map((group) => (
            <div key={group.title} className="mb-3">
              {!collapsed && (
                <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">
                  {group.title}
                </p>
              )}
              {group.items.map((item) => {
                const active = item.href && pathname === item.href;
                const Icon = item.icon;
                const inner = (
                  <span
                    className={`group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-[13px] font-medium transition ${
                      active
                        ? "bg-[rgba(200,16,46,0.14)] text-white"
                        : item.soon
                          ? "text-white/35"
                          : "text-white/75 hover:bg-white/5 hover:text-white"
                    }`}
                    title={collapsed ? item.label : item.soon ? "Fase berikutnya" : undefined}
                  >
                    {active && <span className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-[#C8102E]" />}
                    <Icon className="size-[18px] shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && item.soon && (
                      <span className="ml-auto rounded-full bg-white/10 px-1.5 py-px text-[9px] font-semibold text-white/50">
                        soon
                      </span>
                    )}
                  </span>
                );
                return item.href ? (
                  <Link key={item.label} href={item.href}>
                    {inner}
                  </Link>
                ) : (
                  <div key={item.label} className="cursor-not-allowed">
                    {inner}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Profil bawah */}
        <div className="border-t border-white/10 p-2">
          <div className="flex items-center gap-2 rounded-md px-2 py-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#C8102E] text-xs font-bold">
              {initials || "U"}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{user.name}</span>
                <span className="block truncate text-[10px] text-white/45">{user.role}</span>
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* Kanan: header + content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-[#E8E8E8] bg-white px-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="grid size-9 place-items-center rounded-md text-[#6B7280] hover:bg-[#F8F9FB]"
              aria-label="Toggle sidebar"
            >
              {collapsed ? <Menu className="size-5" /> : <PanelLeft className="size-5" />}
            </button>
            <div className="min-w-0">
              <p className="text-[11px] text-[#6B7280]">WMS · {wh?.name ?? "Gudang"}</p>
              <p className="truncate text-[15px] font-bold leading-tight text-[#111111]">
                {pageTitle(pathname)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Warehouse selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setWhOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full border border-[#E8E8E8] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#111111] hover:bg-[#F8F9FB]"
              >
                <span className="size-2 rounded-full bg-[#C8102E]" />
                {wh ? `${wh.code} · ${wh.name}` : "Pilih gudang"}
                <ChevronDown className="size-3.5 text-[#6B7280]" />
              </button>
              {whOpen && (
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-[#E8E8E8] bg-white py-1 shadow-lg">
                  {warehouses.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => {
                        setActiveWh(w.id);
                        setWhOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-[#F8F9FB] ${
                        w.id === activeWh ? "font-bold text-[#C8102E]" : "text-[#111111]"
                      }`}
                    >
                      <span className="font-mono text-[11px] text-[#6B7280]">{w.code}</span>
                      {w.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="hidden items-center gap-1.5 rounded-md border border-[#E8E8E8] px-2.5 py-1.5 text-[11px] text-[#6B7280] hover:bg-[#F8F9FB] sm:flex"
              title="Command palette"
            >
              <Command className="size-3.5" /> ⌘K
            </button>
            <button
              type="button"
              className="relative grid size-9 place-items-center rounded-md text-[#6B7280] hover:bg-[#F8F9FB]"
              aria-label="Notifikasi"
            >
              <Bell className="size-5" />
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[#C8102E]" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="relative flex-1 overflow-y-auto">
          <div className="absolute inset-x-0 top-0 h-1 bg-[#C8102E]" />
          <main className="p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

function pageTitle(pathname: string) {
  if (pathname === "/warehouse") return "Dashboard";
  if (pathname.startsWith("/warehouse/inventory")) return "Inventory";
  if (pathname.startsWith("/warehouse/receiving")) return "Receiving";
  if (pathname.startsWith("/warehouse/internal-order")) return "Internal Order";
  return "Warehouse";
}

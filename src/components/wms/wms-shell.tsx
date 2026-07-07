"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Bell,
  BookOpen,
  ChefHat,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Coffee,
  Command,
  FileBarChart,
  Factory,
  Layers,
  LayoutDashboard,
  ListChecks,
  Menu,
  Package,
  PanelLeft,
  ScanLine,
  Settings,
  ShoppingCart,
  Sliders,
  Sparkles,
  Tags,
  Thermometer,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";

import type { WmsNotification, WmsWarehouse, WmsWarehouseSummary } from "@/lib/wms-types";
import { garageApi } from "@/lib/api-client";
import { WmsCommandPalette, useWmsCommandPalette } from "@/components/wms/wms-command-palette";
import { WmsNotificationsDrawer } from "@/components/wms/wms-notifications-drawer";

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
      { label: "Scan Barcode", href: "/warehouse/scan", icon: ScanLine },
      { label: "Receiving", href: "/warehouse/receiving", icon: Truck },
      { label: "Transfer", href: "/warehouse/transfer", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Internal Order", href: "/warehouse/internal-order", icon: ShoppingCart },
      { label: "Kitchen", href: "/warehouse/kitchen", icon: ChefHat },
      { label: "Bar", href: "/warehouse/bar", icon: Coffee },
      { label: "Recipe", href: "/warehouse/recipe", icon: BookOpen },
      { label: "Production", href: "/warehouse/production", icon: Factory },
    ],
  },
  {
    title: "Control",
    items: [
      { label: "Stock Opname", href: "/warehouse/opname", icon: ClipboardCheck },
      { label: "Checklist", href: "/warehouse/checklist", icon: ListChecks },
      { label: "Adjustment", href: "/warehouse/adjustment", icon: Sliders },
      { label: "Log Aktivitas", href: "/warehouse/activity-log", icon: Clock },
      { label: "Reports", href: "/warehouse/reports", icon: FileBarChart },
      { label: "Keuangan & HPP", href: "/warehouse/keuangan", icon: Wallet },
    ],
  },
  {
    title: "Smart 2026",
    items: [
      { label: "Smart Reorder", href: "/warehouse/reorder", icon: Sparkles },
      { label: "Cold Chain", href: "/warehouse/cold-chain", icon: Thermometer },
      { label: "Owner Analytics", href: "/warehouse/analytics", icon: TrendingUp },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Master Data", href: "/warehouse/master", icon: Tags },
      { label: "Settings", href: "/warehouse/settings", icon: Settings },
    ],
  },
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const palette = useWmsCommandPalette();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [summary, setSummary] = useState<Record<string, WmsWarehouseSummary>>({});

  useEffect(() => {
    let alive = true;
    void garageApi.get<WmsNotification[]>("/api/wms/notifications").then((d) => {
      if (alive) setNotifCount(d.length);
    }).catch(() => {});
    void garageApi.get<WmsWarehouseSummary[]>("/api/wms/warehouses/summary").then((rows) => {
      if (alive) setSummary(Object.fromEntries(rows.map((r) => [r.warehouseId, r])));
    }).catch(() => {});
    return () => { alive = false; };
  }, [pathname]);
  // Gudang aktif dari URL (?wh=), fallback ke gudang utama. Dibagikan ke halaman
  // lewat URL param supaya stok yang ditampilkan ikut gudang terpilih.
  const defaultWh = warehouses.find((w) => w.isPrimary)?.id ?? warehouses[0]?.id ?? "";
  const activeWh = searchParams.get("wh") ?? defaultWh;
  const isAll = activeWh === "all";
  const [whOpen, setWhOpen] = useState(false);
  const wh = warehouses.find((w) => w.id === activeWh);
  const totalAll = Object.values(summary).reduce(
    (a, s) => ({ items: a.items + s.items, low: a.low + s.low, empty: a.empty + s.empty }),
    { items: 0, low: 0, empty: 0 },
  );

  function selectWarehouse(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("wh", id);
    router.push(`${pathname}?${params.toString()}`);
    setWhOpen(false);
  }

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
              <p className="text-[11px] text-[#6B7280]">WMS · {isAll ? "Semua ruang" : wh?.name ?? "Gudang"}</p>
              <p className="truncate text-[15px] font-bold leading-tight text-[#111111]">
                {pageTitle(pathname)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Kembali ke Garage OS (keluar dari sub-app WMS) */}
            <Link
              href="/os"
              className="flex items-center gap-1.5 rounded-md border border-[#E8E8E8] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#111111] hover:bg-[#F8F9FB]"
              title="Kembali ke Garage OS"
            >
              <ArrowLeft className="size-3.5 text-[#C8102E]" />
              <span className="hidden sm:inline">Garage OS</span>
            </Link>
            {/* Warehouse selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setWhOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full border border-[#E8E8E8] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#111111] hover:bg-[#F8F9FB]"
              >
                <span className="size-2 rounded-full bg-[#C8102E]" />
                {isAll ? "Semua ruang" : wh ? `${wh.code} · ${wh.name}` : "Pilih gudang"}
                <ChevronDown className="size-3.5 text-[#6B7280]" />
              </button>
              {whOpen && (
                <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-[#E8E8E8] bg-white py-1 shadow-lg">
                  {/* Agregat semua ruang */}
                  <button
                    type="button"
                    onClick={() => selectWarehouse("all")}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F8F9FB] ${
                      isAll ? "bg-[#FDF1F3]" : ""
                    }`}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[#111111] text-white">
                      <Layers className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[12.5px] font-bold ${isAll ? "text-[#C8102E]" : "text-[#111111]"}`}>
                        Semua ruang
                      </span>
                      <span className="block text-[10.5px] text-[#6B7280]">Total stok gabungan seluruh gudang</span>
                    </span>
                    <StockBadge low={totalAll.low} empty={totalAll.empty} items={totalAll.items} />
                  </button>
                  <div className="my-1 h-px bg-[#F0F1F4]" />
                  {(["main", "outlet"] as const).map((grp) => {
                    const list = warehouses.filter((w) => (grp === "main" ? w.type === "main" : w.type !== "main"));
                    if (list.length === 0) return null;
                    return (
                      <div key={grp}>
                        <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#9CA3AF]">
                          {grp === "main" ? "Gudang Utama" : "Outlet Jual"}
                        </p>
                        {list.map((w) => {
                          const s = summary[w.id];
                          const AreaIcon = w.area === "dapur" ? ChefHat : w.area === "bar" ? Coffee : Package;
                          const active = !isAll && w.id === activeWh;
                          return (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => selectWarehouse(w.id)}
                              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F8F9FB] ${
                                active ? "bg-[#FDF1F3]" : ""
                              }`}
                            >
                              <span
                                className={`grid size-7 shrink-0 place-items-center rounded-md ${
                                  w.area === "dapur"
                                    ? "bg-[#FEF3C7] text-[#B45309]"
                                    : w.area === "bar"
                                      ? "bg-[#FEE2E2] text-[#C8102E]"
                                      : "bg-[#F0F1F4] text-[#6B7280]"
                                }`}
                              >
                                <AreaIcon className="size-3.5" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={`block truncate text-[12.5px] font-semibold ${active ? "text-[#C8102E]" : "text-[#111111]"}`}>
                                  {w.name}
                                </span>
                                <span className="block text-[10.5px] text-[#6B7280]">
                                  <span className="font-mono">{w.code}</span> · {w.area === "dapur" ? "Dapur" : w.area === "bar" ? "Bar" : "Umum"}
                                </span>
                              </span>
                              <StockBadge low={s?.low ?? 0} empty={s?.empty ?? 0} items={s?.items ?? 0} />
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => palette.setOpen(true)}
              className="hidden items-center gap-1.5 rounded-md border border-[#E8E8E8] px-2.5 py-1.5 text-[11px] text-[#6B7280] hover:bg-[#F8F9FB] sm:flex"
              title="Command palette"
            >
              <Command className="size-3.5" /> ⌘K
            </button>
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative grid size-9 place-items-center rounded-md text-[#6B7280] hover:bg-[#F8F9FB]"
              aria-label="Notifikasi"
            >
              <Bell className="size-5" />
              {notifCount > 0 && (
                <span className="absolute right-1 top-1 grid min-w-[16px] place-items-center rounded-full bg-[#C8102E] px-1 text-[9px] font-bold text-white">
                  {notifCount > 9 ? "9+" : notifCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Content — wms-scope: scrollbar modern 2026 (light) untuk seluruh area konten */}
        <div className="wms-scope relative flex-1 overflow-y-auto">
          <div className="absolute inset-x-0 top-0 h-1 bg-[#C8102E]" />
          <main className="p-6">{children}</main>
        </div>
      </div>
      <WmsCommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />
      <WmsNotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
}

/** Badge status stok ringkas untuk tiap ruang di pemilih gudang. */
function StockBadge({ items, low, empty }: { items: number; low: number; empty: number }) {
  if (low > 0) {
    return (
      <span className="shrink-0 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#B45309]">
        {low} low
      </span>
    );
  }
  if (items > 0) {
    return (
      <span className="shrink-0 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#15803D]">
        {items} item
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-[#F0F1F4] px-2 py-0.5 text-[10px] font-bold text-[#9CA3AF]">
      {empty > 0 ? "kosong" : "0"}
    </span>
  );
}

function pageTitle(pathname: string) {
  if (pathname === "/warehouse") return "Dashboard";
  if (pathname.startsWith("/warehouse/scan")) return "Scan Barcode";
  if (pathname.startsWith("/warehouse/inventory")) return "Inventory";
  if (pathname.startsWith("/warehouse/receiving")) return "Receiving";
  if (pathname.startsWith("/warehouse/transfer")) return "Transfer Antar-Gudang";
  if (pathname.startsWith("/warehouse/kitchen")) return "Kitchen · Stok Dapur";
  if (pathname.startsWith("/warehouse/bar")) return "Bar · Stok Bar";
  if (pathname.startsWith("/warehouse/production")) return "Production";
  if (pathname.startsWith("/warehouse/master")) return "Kelola Master";
  if (pathname.startsWith("/warehouse/recipe")) return "Recipe / BOM";
  if (pathname.startsWith("/warehouse/keuangan")) return "Keuangan & HPP";
  if (pathname.startsWith("/warehouse/reports")) return "Reports";
  if (pathname.startsWith("/warehouse/opname")) return "Stock Opname";
  if (pathname.startsWith("/warehouse/checklist")) return "Checklist Gudang";
  if (pathname.startsWith("/warehouse/adjustment")) return "Adjustment";
  if (pathname.startsWith("/warehouse/reorder")) return "Smart Reorder";
  if (pathname.startsWith("/warehouse/cold-chain")) return "Cold Chain";
  if (pathname.startsWith("/warehouse/analytics")) return "Owner Analytics";
  if (pathname.startsWith("/warehouse/settings")) return "Settings";
  return "Warehouse";
}

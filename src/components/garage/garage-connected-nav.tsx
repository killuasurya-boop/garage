"use client";

import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  ShoppingCart,
  Wallet,
} from "lucide-react";

import type { ModuleId, Role } from "@/lib/garage-data";
import { canAccessModule } from "@/lib/role-access";

export type ConnectedNavLink = {
  id: ModuleId;
  label: string;
  shortLabel: string;
  hint: string;
  icon: LucideIcon;
};

export const connectedNavPresets: Record<
  "finance" | "approvals" | "inventory" | "dashboard",
  { title: string; subtitle: string; links: ConnectedNavLink[] }
> = {
  finance: {
    title: "Alur terhubung",
    subtitle: "POS → Finance → Approval · Desktop, tablet, HP",
    links: [
      {
        id: "pos",
        label: "POS Kasir",
        shortLabel: "POS",
        hint: "Shift, transaksi, pembayaran",
        icon: ShoppingCart,
      },
      {
        id: "approvals",
        label: "Approval",
        shortLabel: "Approve",
        hint: "Void, diskon, expense besar",
        icon: ClipboardCheck,
      },
      {
        id: "inventory",
        label: "Produk & Gudang",
        shortLabel: "Stok",
        hint: "BOM, opname, mutasi",
        icon: Boxes,
      },
      {
        id: "earnings",
        label: "Fee Karyawan",
        shortLabel: "Fee",
        hint: "Accrual & payout staff",
        icon: Wallet,
      },
      {
        id: "dashboard",
        label: "Dashboard",
        shortLabel: "Owner",
        hint: "Snapshot omzet harian",
        icon: LayoutDashboard,
      },
    ],
  },
  approvals: {
    title: "Alur terhubung",
    subtitle: "POS → Approval → Finance · keputusan kasir & manager",
    links: [
      {
        id: "pos",
        label: "POS Kasir",
        shortLabel: "POS",
        hint: "Order & QR pending",
        icon: ShoppingCart,
      },
      {
        id: "finance",
        label: "Finance",
        shortLabel: "Finance",
        hint: "Expense & closing",
        icon: CreditCard,
      },
      {
        id: "inventory",
        label: "Produk & Gudang",
        shortLabel: "Stok",
        hint: "Opname & adjustment",
        icon: Boxes,
      },
      {
        id: "dashboard",
        label: "Dashboard",
        shortLabel: "Owner",
        hint: "KPI & alert",
        icon: LayoutDashboard,
      },
    ],
  },
  inventory: {
    title: "Alur terhubung",
    subtitle: "Stok → BOM → Finance margin",
    links: [
      {
        id: "finance",
        label: "Finance",
        shortLabel: "Finance",
        hint: "Margin & food cost",
        icon: CreditCard,
      },
      {
        id: "pos",
        label: "POS Kasir",
        shortLabel: "POS",
        hint: "Penjualan & recipe deduct",
        icon: ShoppingCart,
      },
      {
        id: "approvals",
        label: "Approval",
        shortLabel: "Approve",
        hint: "Opname & adjustment",
        icon: ClipboardCheck,
      },
      {
        id: "dashboard",
        label: "Dashboard",
        shortLabel: "Owner",
        hint: "Low stock alert",
        icon: LayoutDashboard,
      },
    ],
  },
  dashboard: {
    title: "Alur terhubung",
    subtitle: "Owner snapshot ↔ POS & Finance",
    links: [
      {
        id: "pos",
        label: "POS Kasir",
        shortLabel: "POS",
        hint: "Transaksi live",
        icon: ShoppingCart,
      },
      {
        id: "finance",
        label: "Finance",
        shortLabel: "Finance",
        hint: "Closing & export",
        icon: CreditCard,
      },
      {
        id: "approvals",
        label: "Approval",
        shortLabel: "Approve",
        hint: "Pending keputusan",
        icon: ClipboardCheck,
      },
      {
        id: "inventory",
        label: "Produk & Gudang",
        shortLabel: "Stok",
        hint: "Opname & BOM",
        icon: Boxes,
      },
    ],
  },
};

export function GarageConnectedNav({
  role,
  preset,
  activeModule,
  onNavigate,
}: {
  role: Role;
  preset: keyof typeof connectedNavPresets;
  activeModule: ModuleId;
  onNavigate?: (module: ModuleId) => void;
}) {
  const config = connectedNavPresets[preset];
  const visible = config.links.filter((link) => canAccessModule(role, link.id));
  if (visible.length === 0 || !onNavigate) return null;

  return (
    <nav
      aria-label={`Modul terhubung ${preset}`}
      className="rounded-lg border border-[#34343c] bg-[#111116] p-2"
    >
      <div className="mb-2 flex flex-col gap-0.5 px-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f99]">
          {config.title}
        </p>
        <p className="text-[10px] text-[#b8b8bf] sm:text-right">{config.subtitle}</p>
      </div>
      <div className="garage-scroll-x flex gap-2 pb-0.5">
        {visible.map((link) => {
          const Icon = link.icon;
          const isHere = link.id === activeModule;
          return (
            <button
              key={link.id}
              type="button"
              onClick={() => onNavigate(link.id)}
              className={`garage-press flex min-w-[108px] max-w-[140px] shrink-0 flex-col items-start rounded-md border px-3 py-2 text-left transition-colors sm:min-w-[120px] ${
                isHere
                  ? "border-[#f5a742]/55 bg-[#f5a742]/14"
                  : "border-[#34343c] bg-white/[0.04] hover:border-[#f5a742]/40"
              }`}
            >
              <span className="flex w-full items-center gap-1.5">
                <Icon className="size-3.5 shrink-0 text-[#f5a742]" />
                <span className="truncate text-xs font-bold text-white sm:hidden">
                  {link.shortLabel}
                </span>
                <span className="hidden truncate text-xs font-bold text-white sm:inline">
                  {link.label}
                </span>
              </span>
              <span className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#b8b8bf]">
                {link.hint}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

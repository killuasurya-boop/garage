"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Bell, Download, Filter, LayoutDashboard, Menu, RefreshCw, Search } from "lucide-react";
import { useDashboard, type DateRange, type Department } from "../store/dashboardStore";

const ranges: { id: DateRange; label: string }[] = [
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
  { id: "1y", label: "1Y" },
];

const depts: { id: Department; label: string }[] = [
  { id: "all", label: "Semua divisi" },
  { id: "pos", label: "POS" },
  { id: "kitchen", label: "Dapur" },
  { id: "inventory", label: "Stok" },
  { id: "finance", label: "Keuangan" },
  { id: "hr", label: "Tim" },
  { id: "marketing", label: "Marketing" },
  { id: "procurement", label: "Pembelian" },
];

export function Topbar() {
  const { dateRange, setDateRange, department, setDepartment, unreadCount, setNotifPanelOpen, setFilterPanelOpen, filterPanelOpen, setMobileNavOpen } = useDashboard();
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
    toast.success("Dashboard diperbarui");
  };

  const onExport = () => {
    toast.message("Menyiapkan laporan...", { description: "Ringkasan owner sedang diproses." });
  };

  return (
    <div className="sticky top-0 z-20 border-b border-white/10 bg-[var(--garage-bg-1)]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-2 text-zinc-200 hover:bg-[var(--garage-bg-3)] md:hidden"
          aria-label="Buka menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <Link
          href="/os?module=dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--garage-red)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_16%,transparent)] px-3 py-1.5 text-[11px] font-semibold uppercase text-[#ffc5c5] hover:bg-[color-mix(in_srgb,var(--garage-red)_25%,transparent)]"
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">OS Dashboard</span>
          <span className="sm:hidden">OS</span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari modul, KPI, alert..."
            className="min-w-0 flex-1 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-500"
          />
        </div>

        <div className="hidden items-center gap-1 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-1 lg:flex">
          {ranges.map((r) => (
            <button
              key={r.id}
              onClick={() => setDateRange(r.id)}
              className={`rounded-md px-3 py-1 text-[11px] font-semibold uppercase transition ${
                dateRange === r.id ? "bg-[color-mix(in_srgb,var(--garage-red)_22%,transparent)] text-[#ffd0d0]" : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value as Department)}
          className="hidden rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5 text-xs text-zinc-100 lg:block"
        >
          {depts.map((d) => (
            <option key={d.id} value={d.id} className="bg-[#1a1111]">
              {d.label}
            </option>
          ))}
        </select>

        <button
          onClick={() => setFilterPanelOpen(!filterPanelOpen)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)]"
        >
          <Filter className="h-3.5 w-3.5" /> Filter
        </button>

        <button
          onClick={onExport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--garage-amber)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_18%,transparent)] px-3 py-1.5 text-[11px] font-semibold uppercase text-[#ffd8a8] hover:bg-[color-mix(in_srgb,var(--garage-amber)_28%,transparent)]"
        >
          <Download className="h-3.5 w-3.5" /> Ekspor
        </button>

        <button onClick={onRefresh} className="rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-1.5 text-zinc-300 hover:bg-[var(--garage-bg-3)]" title="Perbarui">
          <motion.span animate={refreshing ? { rotate: 360 } : { rotate: 0 }} transition={{ duration: 0.9 }}>
            <RefreshCw className="h-3.5 w-3.5" />
          </motion.span>
        </button>

        <button
          onClick={() => setNotifPanelOpen(true)}
          className="relative rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-1.5 text-zinc-300 hover:bg-[var(--garage-bg-3)]"
          title="Notifikasi"
        >
          <Bell className="h-3.5 w-3.5" />
          {unreadCount > 0 ? (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--garage-red-bright)] px-1 text-[9px] font-bold text-white shadow-[0_0_8px_color-mix(in_srgb,var(--garage-red-bright)_70%,transparent)]"
            >
              {unreadCount}
            </motion.span>
          ) : null}
        </button>

        <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-2 py-1 lg:flex">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#c41a1a] to-[#7a0f0f] text-[10px] font-bold text-white">CE</div>
          <div className="leading-tight">
            <p className="text-[11px] font-semibold text-zinc-100">CEO</p>
            <p className="text-[9px] uppercase text-zinc-400">Owner</p>
          </div>
        </div>
      </div>
    </div>
  );
}

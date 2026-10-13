"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Bell, Download, LayoutDashboard, Menu, RefreshCw, Search } from "lucide-react";
import { useDashboard } from "../store/dashboardStore";
import { controlNav } from "./Sidebar";

export function Topbar() {
  const { unreadCount, setNotifPanelOpen, setMobileNavOpen } = useDashboard();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  // Muat ulang data server halaman ini (bukan notifikasi palsu).
  const onRefresh = () => {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 900);
  };

  // Cari menu Control Center lalu buka halamannya.
  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim().toLowerCase();
    if (!term) return;
    const match = controlNav.find((item) => item.label.toLowerCase().includes(term) || item.href.includes(term));
    if (match) {
      router.push(match.href);
      setQuery("");
    } else {
      toast.error(`Menu "${query.trim()}" tidak ditemukan.`);
    }
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

        <form
          role="search"
          onSubmit={onSearch}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5"
        >
          <Search className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            list="control-nav-search"
            aria-label="Cari menu Control Center"
            placeholder="Cari menu (Penjualan, Inventory, Cash Closing…)"
            className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          <datalist id="control-nav-search">
            {controlNav.map((item) => (
              <option key={item.href} value={item.label} />
            ))}
          </datalist>
        </form>

        <Link
          href="/os?module=finance&tab=reports"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--garage-amber)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_18%,transparent)] px-3 py-1.5 text-[11px] font-semibold uppercase text-[#ffd8a8] hover:bg-[color-mix(in_srgb,var(--garage-amber)_28%,transparent)]"
        >
          <Download className="h-3.5 w-3.5" /> Laporan
        </Link>

        <button type="button" onClick={onRefresh} aria-label="Muat ulang data" className="rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-1.5 text-zinc-300 hover:bg-[var(--garage-bg-3)]" title="Muat ulang data">
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
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#d11a2a] to-[#8b0f1a] text-[10px] font-bold text-white">CE</div>
          <div className="leading-tight">
            <p className="text-[11px] font-semibold text-zinc-100">CEO</p>
            <p className="text-[9px] uppercase text-zinc-400">Owner</p>
          </div>
        </div>
      </div>
    </div>
  );
}

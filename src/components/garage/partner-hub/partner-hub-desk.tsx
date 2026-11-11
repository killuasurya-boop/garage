"use client";

// Garage OS — Partner Hub (staf). Tab per peran: Pesanan Mitra & Ambil dari Mitra (waiter/kasir),
// Keuangan Mitra (kasir/Owner/Manajer), Kelola Mitra (Owner/Manajer). Tanpa blur berat (DEC-17).

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { GarageBrandLogo } from "@/components/garage/member-auth/garage-brand-logo";

import { DeskApplications } from "./desk-applications";
import { DeskFinance } from "./desk-finance";
import { DeskManage } from "./desk-manage";
import { DeskOrders } from "./desk-orders";

type TabId = "orders" | "pickup" | "finance" | "manage" | "applications";

export function PartnerHubDesk({ role, userId, userName, hubEnabled, sla }: { role: string; userId: string; userName: string; hubEnabled: boolean; sla: { accept: number; ready: number } }) {
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "orders", label: "Pesanan Mitra" },
    { id: "pickup", label: "Ambil dari Mitra" },
    ...(role !== "Waiter" ? [{ id: "finance" as const, label: "Keuangan Mitra" }] : []),
    ...(role === "Owner" || role === "Manajer" ? [{ id: "manage" as const, label: "Kelola Mitra" }, { id: "applications" as const, label: "Pendaftar Mitra" }] : []),
  ];
  const [tab, setTab] = useState<TabId>(role === "Waiter" ? "pickup" : "orders");
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab") as TabId | null;
    // Ambil data saat tampil (pola repo: fetch-on-mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (wanted && tabs.some((t) => t.id === wanted)) setTab(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-dvh bg-[#0b0b0d] pb-12 text-[#f4f4f5]">
      <header className="border-b border-[#2a2a30] bg-[#111114] px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <a href={role === "Kasir" ? "/pos" : "/os"} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#3a3a42] px-3 text-sm text-[#e4e4e8] hover:bg-white/5">
            <ArrowLeft className="size-4" /> Kembali
          </a>
          <div className="w-28 shrink-0">
            <GarageBrandLogo sizes="112px" />
          </div>
          <p className="ml-auto text-right text-xs text-[#b8b8bf]">
            {userName}
            <br />
            {role}
          </p>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-4 px-4 pt-5">
        <section>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff5a66]">Garage OS</p>
          <h1 className="text-2xl font-black text-white sm:text-3xl">Partner Hub</h1>
          <p className="text-sm text-[#b8b8bf]">Mitra resmi, pesanan, pengantaran, setoran, dan laporan PDF mitra.</p>
        </section>
        {!hubEnabled ? (
          <p role="status" className="rounded-lg border border-[#f5a742]/50 bg-[#3a2a10] px-3 py-2 text-sm text-[#fde68a]">
            Partner Hub belum aktif di outlet ini (Pengaturan → Partner Hub). Produk mitra belum bisa dijual; data master tetap bisa disiapkan.
          </p>
        ) : null}
        <nav className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Menu Partner Hub">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-11 shrink-0 rounded-lg border px-4 text-sm font-bold transition-colors ${tab === t.id ? "border-[#ff5a66] bg-[#d11a2a] text-white" : "border-[#3a3a42] bg-white/[0.04] text-[#e4e4e8] hover:bg-white/10"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div role="tabpanel">
          {tab === "orders" ? <DeskOrders mode="monitor" slaWarnMinutes={sla.accept} readyWarnMinutes={sla.ready} /> : null}
          {tab === "pickup" ? <DeskOrders mode="pickup" slaWarnMinutes={sla.accept} readyWarnMinutes={sla.ready} /> : null}
          {tab === "finance" ? <DeskFinance role={role} userId={userId} /> : null}
          {tab === "manage" ? <DeskManage role={role} /> : null}
          {tab === "applications" ? <DeskApplications role={role} /> : null}
        </div>
      </div>
    </main>
  );
}

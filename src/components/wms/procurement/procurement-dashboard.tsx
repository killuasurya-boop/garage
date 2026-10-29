"use client";

import { ClipboardList, FileClock, PackageSearch, Receipt, Send, ShieldQuestion, Truck, TriangleAlert, Warehouse } from "lucide-react";

import type { ProcTone } from "@/lib/wms-procurement-meta";
import { Skeleton, TONE, rupiah } from "./proc-ui";

export type ProcDashboard = {
  requestsOpen: number;
  requestsWaiting: number;
  shortages: number;
  poDraft: number;
  poPendingApproval: number;
  poReadyToSend: number;
  poAwaitingSupplier: number;
  poInDelivery: number;
  poPartial: number;
  billsUnpaid: number;
  billsOutstanding: number;
  billsOverdue: number;
  paymentsPendingVerification: number;
};

type Card = { key: string; label: string; value: number; sub?: string; tone: ProcTone; icon: typeof Truck; href?: string; filter?: string };

/** KPI Command Center: angka + label + ikon (warna hanya penguat). Klik = saring daftar. */
export function ProcurementDashboard({ data, onFilter }: { data: ProcDashboard | null; onFilter: (target: { tab: "po" | "bills"; filter?: string }) => void }) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" aria-busy="true" aria-label="Memuat ringkasan">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#E8E8E8] bg-white p-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-6 w-12" />
          </div>
        ))}
      </div>
    );
  }
  const cards: Card[] = [
    { key: "req", label: "Permintaan Bar/Dapur", value: data.requestsOpen, sub: "belum selesai", tone: data.requestsOpen ? "blue" : "gray", icon: ClipboardList, href: "/warehouse/material-requests" },
    { key: "wait", label: "Menunggu proses Gudang", value: data.requestsWaiting, sub: "perlu dikirim", tone: data.requestsWaiting ? "amber" : "gray", icon: Warehouse, href: "/warehouse/material-requests" },
    { key: "short", label: "Stok kurang", value: data.shortages, sub: "belum dibuatkan PO", tone: data.shortages ? "red" : "green", icon: PackageSearch },
    { key: "appr", label: "PO menunggu persetujuan", value: data.poPendingApproval, tone: data.poPendingApproval ? "amber" : "gray", icon: FileClock, filter: "pending_approval" },
    { key: "ready", label: "PO siap dikirim", value: data.poReadyToSend, sub: "buat PDF & kirim WA", tone: data.poReadyToSend ? "amber" : "gray", icon: Send, filter: "ready" },
    { key: "conf", label: "Menunggu konfirmasi supplier", value: data.poAwaitingSupplier, tone: data.poAwaitingSupplier ? "blue" : "gray", icon: Send, filter: "sent" },
    { key: "ship", label: "Barang dalam pengiriman", value: data.poInDelivery, tone: data.poInDelivery ? "blue" : "gray", icon: Truck, filter: "delivery" },
    { key: "part", label: "Diterima sebagian", value: data.poPartial, tone: data.poPartial ? "amber" : "gray", icon: TriangleAlert, filter: "partial" },
    {
      key: "bill",
      label: "Tagihan belum dibayar",
      value: data.billsUnpaid,
      sub: data.billsOutstanding ? `${rupiah(data.billsOutstanding)}${data.billsOverdue ? ` · ${data.billsOverdue} lewat jatuh tempo` : ""}` : undefined,
      tone: data.billsOverdue ? "red" : data.billsUnpaid ? "amber" : "green",
      icon: Receipt,
    },
    { key: "verify", label: "Menunggu verifikasi bayar", value: data.paymentsPendingVerification, tone: data.paymentsPendingVerification ? "purple" : "gray", icon: ShieldQuestion },
  ];
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" aria-label="Ringkasan pengadaan">
      {cards.map((c) => {
        const inner = (
          <>
            <span className="flex items-start justify-between gap-2">
              <span className="text-[12px] font-semibold leading-tight text-[#374151]">{c.label}</span>
              <c.icon className={`size-4 shrink-0 ${TONE[c.tone].pill.split(" ").find((x) => x.startsWith("text-"))}`} aria-hidden="true" />
            </span>
            <span className="mt-1 block font-mono text-[22px] font-extrabold tabular-nums text-[#111111]">{c.value}</span>
            {c.sub && <span className="block truncate text-[11.5px] text-[#4B5563]">{c.sub}</span>}
          </>
        );
        const cls = `block h-full w-full rounded-xl border-l-4 border border-[#E8E8E8] bg-white p-3 text-left transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/30 motion-reduce:transition-none ${TONE[c.tone].card}`;
        return (
          <li key={c.key}>
            {c.href ? (
              <a href={c.href} className={cls}>{inner}</a>
            ) : (
              <button type="button" className={cls} onClick={() => onFilter(c.key === "bill" || c.key === "verify" ? { tab: "bills", filter: c.key === "verify" ? "verify" : "open" } : { tab: "po", filter: c.filter })}>
                {inner}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

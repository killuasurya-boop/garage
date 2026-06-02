"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Filter, RotateCcw } from "lucide-react";
import { useDashboard, type DateRange, type Department } from "../store/dashboardStore";

const ranges: { id: DateRange; label: string }[] = [
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
  { id: "1y", label: "1Y" },
];

const depts: { id: Department; label: string }[] = [
  { id: "all", label: "Semua" },
  { id: "pos", label: "POS" },
  { id: "kitchen", label: "Dapur" },
  { id: "inventory", label: "Stok" },
  { id: "finance", label: "Keuangan" },
  { id: "hr", label: "Tim" },
  { id: "marketing", label: "Marketing" },
  { id: "procurement", label: "Pembelian" },
];

export function ControlFilterPanel() {
  const { filterPanelOpen, setFilterPanelOpen, dateRange, setDateRange, department, setDepartment } = useDashboard();
  const [region, setRegion] = useState("all");
  const [product, setProduct] = useState("all");

  return (
    <AnimatePresence initial={false}>
      {filterPanelOpen ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden border-b border-white/10 bg-[var(--garage-bg-1)]"
        >
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-4">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase text-zinc-400">Periode</p>
              <div className="flex flex-wrap gap-1.5">
                {ranges.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setDateRange(r.id)}
                    className={`rounded-md border px-3 py-1 text-xs font-semibold uppercase transition ${
                      dateRange === r.id
                        ? "border-[color-mix(in_srgb,var(--garage-red)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_22%,transparent)] text-[#ffb1b1]"
                        : "border-white/10 bg-[var(--garage-bg-2)] text-zinc-300 hover:bg-[var(--garage-bg-3)]"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase text-zinc-400">Divisi</p>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value as Department)}
                className="w-full rounded-md border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5 text-xs text-zinc-100 focus:border-amber-400/50 focus:outline-none"
              >
                {depts.map((d) => (
                  <option key={d.id} value={d.id} className="bg-[#1a1111]">
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase text-zinc-400">Area</p>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5 text-xs text-zinc-100 focus:border-amber-400/50 focus:outline-none"
              >
                {["all", "Jakarta", "Depok", "Bogor"].map((r) => (
                  <option key={r} value={r.toLowerCase()} className="bg-[#1a1111]">
                    {r === "all" ? "Semua" : r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase text-zinc-400">Lini produk</p>
              <select
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5 text-xs text-zinc-100 focus:border-amber-400/50 focus:outline-none"
              >
                {["all", "Kopi", "Makanan", "Catering"].map((p) => (
                  <option key={p} value={p.toLowerCase()} className="bg-[#1a1111]">
                    {p === "all" ? "Semua" : p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-white/5 px-4 py-2">
            <button
              onClick={() => {
                setDateRange("30d");
                setDepartment("all");
                setRegion("all");
                setProduct("all");
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)]"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
            <button
              onClick={() => setFilterPanelOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[color-mix(in_srgb,var(--garage-red)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_22%,transparent)] px-3 py-1.5 text-[11px] font-semibold uppercase text-[#ffd0d0] hover:bg-[color-mix(in_srgb,var(--garage-red)_30%,transparent)]"
            >
              <Filter className="h-3 w-3" /> Terapkan
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

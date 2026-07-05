"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

type PaletteItem = { label: string; href: string; group: string; keywords?: string };

const ITEMS: PaletteItem[] = [
  { label: "Dashboard", href: "/warehouse", group: "Main" },
  { label: "Inventory", href: "/warehouse/inventory", group: "Main", keywords: "stok produk sku" },
  { label: "Scan Barcode", href: "/warehouse/scan", group: "Main", keywords: "qr kamera" },
  { label: "Receiving", href: "/warehouse/receiving", group: "Main", keywords: "terima supplier" },
  { label: "Transfer", href: "/warehouse/transfer", group: "Main" },
  { label: "Internal Order", href: "/warehouse/internal-order", group: "Operations", keywords: "dapur bar keluar" },
  { label: "Kitchen", href: "/warehouse/kitchen", group: "Operations" },
  { label: "Bar", href: "/warehouse/bar", group: "Operations" },
  { label: "Recipe / BOM", href: "/warehouse/recipe", group: "Operations", keywords: "resep food cost" },
  { label: "Production", href: "/warehouse/production", group: "Operations" },
  { label: "Stock Opname", href: "/warehouse/opname", group: "Control" },
  { label: "Adjustment", href: "/warehouse/adjustment", group: "Control" },
  { label: "Reports", href: "/warehouse/reports", group: "Control" },
  { label: "Keuangan & HPP", href: "/warehouse/keuangan", group: "Control" },
  { label: "Smart Reorder", href: "/warehouse/reorder", group: "Smart 2026", keywords: "forecast po beli" },
  { label: "Cold Chain", href: "/warehouse/cold-chain", group: "Smart 2026" },
  { label: "Owner Analytics", href: "/warehouse/analytics", group: "Smart 2026" },
  { label: "Master Data", href: "/warehouse/master", group: "System" },
  { label: "Settings", href: "/warehouse/settings", group: "System", keywords: "sync integrasi pos" },
  { label: "Sinkron OS → WMS", href: "/warehouse/settings?sync=1", group: "Aksi", keywords: "bridge migrate inventory resep" },
];

export function WmsCommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  function close() {
    setQ("");
    onClose();
  }
  function go(href: string) {
    setQ("");
    router.push(href);
    onClose();
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return ITEMS;
    return ITEMS.filter(
      (i) =>
        i.label.toLowerCase().includes(needle) ||
        i.group.toLowerCase().includes(needle) ||
        (i.keywords ?? "").includes(needle),
    );
  }, [q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-black/40 px-4 pt-[12vh]" onClick={close}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[#E8E8E8] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "wms-palette-in 0.22s ease-out" }}
      >
        <div className="flex items-center gap-2 border-b border-[#E8E8E8] px-3 py-2.5">
          <Search className="size-4 text-[#6B7280]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              if (e.key === "Enter" && filtered[0]) go(filtered[0].href);
            }}
            placeholder="Cari modul atau aksi…"
            className="h-9 flex-1 bg-transparent text-[14px] outline-none"
          />
          <button type="button" onClick={close} className="grid size-8 place-items-center rounded-md text-[#6B7280] hover:bg-[#F8F9FB]">
            <X className="size-4" />
          </button>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-[13px] text-[#6B7280]">Tidak ada hasil.</li>
          ) : (
            filtered.map((item) => (
              <li key={item.href + item.label}>
                <Link
                  href={item.href}
                  onClick={close}
                  className="flex items-center justify-between px-4 py-2.5 text-[13px] hover:bg-[#F8F9FB]"
                >
                  <span className="font-semibold text-[#111111]">{item.label}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF]">{item.group}</span>
                </Link>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-[#E8E8E8] px-4 py-2 text-[10px] text-[#9CA3AF]">↑↓ navigasi · Enter buka · Esc tutup</p>
      </div>
      <style jsx global>{`
        @keyframes wms-palette-in {
          from { opacity: 0; transform: scale(0.96) translateY(-6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

/** Hook ⌘K / Ctrl+K untuk command palette. */
export function useWmsCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

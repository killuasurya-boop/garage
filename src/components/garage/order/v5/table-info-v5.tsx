"use client";

// Pilih Meja — mode Daftar Pilihan (master prompt §3).
// Nomor meja di menu pelanggan HANYA konteks: dipakai di layar "Tunjukkan ke Waiter" dan jawaban AYA.
// Komponen ini tidak membuat pesanan, tidak mengunci/menahan meja, tidak mengubah status okupansi:
// satu-satunya panggilan server = GET daftar meja aktif (read-only). Penetapan meja resmi tetap oleh waiter.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Armchair, Check, Info, Loader2, RefreshCw, Search, X } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { MAX_TABLE_NUMBER, parseTableNumber, tableLabelFor } from "@/lib/garage-tables";

export type TableInfo = { tableNumber: string; tableLabel: string };

type PublicTable = { tableNumber: string; tableLabel: string; area: string };

const infoKey = (outletId?: string) => `garage:tableInfo:${outletId ?? "default"}`;

export function readTableInfo(outletId?: string): TableInfo | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(infoKey(outletId)) ?? "null") as TableInfo | null;
    return parsed && typeof parsed.tableNumber === "string" && typeof parsed.tableLabel === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeTableInfo(outletId: string | undefined, info: TableInfo | null) {
  try {
    if (info) window.sessionStorage.setItem(infoKey(outletId), JSON.stringify(info));
    else window.sessionStorage.removeItem(infoKey(outletId));
  } catch {
    /* sessionStorage tidak tersedia */
  }
}

/** Saring nomor meja: "7" cocok dengan 07, 17, 27…; "07" cocok persis di depan. */
export function filterTables<T extends { tableNumber: string; area?: string }>(tables: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...tables];
  const digits = q.replace(/\D/g, "");
  return tables.filter((table) => {
    if (digits) {
      const n = String(Number(table.tableNumber));
      return table.tableNumber.startsWith(digits) || n.startsWith(String(Number(digits))) || n.includes(digits);
    }
    return (table.area ?? "").toLowerCase().includes(q);
  });
}

function fallbackTables(): PublicTable[] {
  return Array.from({ length: MAX_TABLE_NUMBER }, (_, i) => {
    const number = parseTableNumber(String(i + 1)) ?? String(i + 1).padStart(2, "0");
    return { tableNumber: number, tableLabel: tableLabelFor(number), area: "" };
  });
}

export function TableInfoPickerV5({
  open,
  onOpenChange,
  outletId,
  current,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outletId?: string;
  current: TableInfo | null;
  onConfirm: (info: TableInfo | null) => void;
}) {
  const [tables, setTables] = useState<PublicTable[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("all");
  const [selected, setSelected] = useState<string | null>(current?.tableNumber ?? null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch(`/api/customer/tables/live${outletId ? `?outletId=${encodeURIComponent(outletId)}` : ""}`, { cache: "no-store" });
      const json = (await response.json().catch(() => null)) as { data?: PublicTable[] } | null;
      if (!response.ok || !Array.isArray(json?.data)) throw new Error("load");
      setTables(json.data.map(({ tableNumber, tableLabel, area: a }) => ({ tableNumber, tableLabel, area: a ?? "" })));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [outletId]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset pilihan tiap kali dibuka
    setSelected(current?.tableNumber ?? null);
    setQuery("");
    void load();
  }, [current?.tableNumber, load, open]);

  const areas = useMemo(() => [...new Set((tables ?? []).map((row) => row.area.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [tables]);
  const visible = useMemo(() => filterTables((tables ?? []).filter((row) => area === "all" || row.area.trim() === area), query), [tables, area, query]);
  const chosen = (tables ?? fallbackTables()).find((row) => row.tableNumber === selected) ?? null;

  function confirm() {
    if (!chosen) return;
    onConfirm({ tableNumber: chosen.tableNumber, tableLabel: chosen.tableLabel || tableLabelFor(chosen.tableNumber) });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="gm5 inset-x-0 bottom-0 z-[97] mx-auto flex max-h-[90dvh] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-t-[20px] border border-[color:var(--gm5-line)] bg-[#08090b] p-0 text-white sm:bottom-4 sm:w-[min(640px,calc(100vw-32px))] sm:rounded-[20px]"
      >
        <div className="flex items-start gap-3 border-b border-white/10 px-4 py-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[color:var(--gm5-line)] bg-[#111216]" aria-hidden>
            <Armchair className="size-5 text-[var(--menu-red-bright)]" />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="gm5-title text-lg text-white">Pilih Meja</SheetTitle>
            <SheetDescription className="text-sm leading-snug text-[#d4d4da]">Penanda untuk waiter. Memilih meja tidak membuat pesanan.</SheetDescription>
          </div>
          <button type="button" className="gm5-icon-btn gm5-close-btn !h-11 !w-11 shrink-0" aria-label="Tutup pilih meja" onClick={() => onOpenChange(false)}>
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-2.5 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--gm5-line)] bg-[#111216] px-3 py-2.5" aria-live="polite">
            <span className="text-sm text-[#d4d4da]">Meja yang dilihat:</span>
            <span className="font-mono text-2xl font-bold tabular-nums text-white">{chosen ? chosen.tableNumber : "—"}</span>
            {current && current.tableNumber !== selected ? <span className="ml-auto text-xs text-[#d4d4da]">sebelumnya {current.tableLabel}</span> : null}
          </div>
          <label className="relative block">
            <span className="sr-only">Cari nomor meja</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-[#b8b8be]" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 12))}
              inputMode="numeric"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Cari nomor meja, mis. 7"
              className="h-12 w-full rounded-full border border-white/15 bg-[#111216] pl-11 pr-11 text-base text-white outline-none placeholder:text-[#9a9aa4] focus:border-[var(--menu-red)]"
            />
            {query ? (
              <button type="button" className="gm5-icon-btn absolute right-1 top-1/2 !h-10 !w-10 -translate-y-1/2" aria-label="Hapus pencarian meja" onClick={() => setQuery("")}>
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </label>
          {areas.length > 1 ? (
            <div className="gm5-chip-row -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Area meja">
              {["all", ...areas].map((value) => (
                <button key={value} type="button" className="gm5-chip !min-h-10 shrink-0 !px-3.5 !text-[13px]" aria-pressed={area === value} onClick={() => setArea(value)}>
                  {value === "all" ? "Semua area" : value}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-[180px] flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {state === "loading" && !tables ? (
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-8" aria-label="Memuat daftar meja">
              {Array.from({ length: 15 }).map((_, i) => (
                <span key={i} className="gm5-skeleton h-14 rounded-[14px] bg-[#1d1a1c]" />
              ))}
            </div>
          ) : state === "error" && !tables ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center" role="alert">
              <p className="text-sm text-[#e4e4e8]">Daftar meja gagal dimuat.</p>
              <div className="flex gap-2">
                <button type="button" className="gm5-btn-red min-h-11 gap-1.5 px-4 text-sm" onClick={() => void load()}>
                  <RefreshCw className="size-4" aria-hidden /> Coba lagi
                </button>
                <button
                  type="button"
                  className="gm5-btn-ghost min-h-11 px-4 text-sm"
                  onClick={() => {
                    setTables(fallbackTables());
                    setState("ready");
                  }}
                >
                  Pilih manual 01–{MAX_TABLE_NUMBER}
                </button>
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-[#e4e4e8]">{query ? `Meja “${query}” tidak ditemukan.` : "Belum ada meja aktif."}</p>
              {query ? (
                <button type="button" className="gm5-btn-ghost min-h-11 px-4 text-sm" onClick={() => setQuery("")}>
                  Tampilkan semua meja
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="grid grid-cols-5 gap-2 sm:grid-cols-8" aria-label="Daftar meja">
              {visible.map((table) => (
                <li key={table.tableNumber}>
                  <button
                    type="button"
                    className="gm5-table-btn w-full"
                    aria-pressed={selected === table.tableNumber}
                    aria-label={`${table.tableLabel}${table.area ? `, ${table.area}` : ""}`}
                    onClick={() => setSelected(table.tableNumber)}
                  >
                    <span className="font-mono text-lg font-bold tabular-nums leading-none">{table.tableNumber}</span>
                    {selected === table.tableNumber ? <Check className="mt-0.5 size-3.5" strokeWidth={3} aria-hidden /> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {state === "loading" && tables ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-[#d4d4da]">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Memperbarui…
            </p>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-white/10 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <p className="flex items-start gap-2 text-xs leading-snug text-[#d4d4da]">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Pesanan resmi tetap dicatat oleh waiter di mejamu.
          </p>
          <div className="flex gap-2">
            {current ? (
              <button
                type="button"
                className="gm5-btn-ghost min-h-12 px-4 text-sm"
                onClick={() => {
                  onConfirm(null);
                  onOpenChange(false);
                }}
              >
                Hapus pilihan
              </button>
            ) : (
              <button type="button" className="gm5-btn-ghost min-h-12 px-4 text-sm" onClick={() => onOpenChange(false)}>
                Kembali
              </button>
            )}
            <button type="button" className="gm5-btn-red min-h-12 flex-1 px-4 text-base" disabled={!chosen} onClick={confirm}>
              {chosen ? `Pakai ${chosen.tableLabel || tableLabelFor(chosen.tableNumber)}` : "Pilih nomor meja"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

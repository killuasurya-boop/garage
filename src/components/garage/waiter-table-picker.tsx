"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

import type { TableLiveRow } from "@/lib/garage-api-types";
import { parseTableNumber } from "@/lib/garage-tables";

import { TABLE_LEGEND, isCleaningTable, isDirtyTable, tableTone } from "./waiter-view-helpers";

// Pemilih meja "Pesankan": grid nomor meja dengan warna status yang sama dengan
// peta meja + kolom ketik nomor. Meja kotor/dipesan tetap bisa dipilih (pesanan
// tambahan), tapi diberi tanda; meja nonaktif tidak tampil.
export function TablePicker({
  tables,
  pendingTable,
  onPick,
  onClose,
}: {
  tables: TableLiveRow[];
  pendingTable: string | null;
  onPick: (tableNumber: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeTables = useMemo(() => tables.filter((row) => row.active !== false), [tables]);
  const byNumber = useMemo(() => new Map(activeTables.map((row) => [row.tableNumber, row])), [activeTables]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submitNumber(event: FormEvent) {
    event.preventDefault();
    const tableNumber = parseTableNumber(query);
    if (!tableNumber || !byNumber.has(tableNumber)) {
      setInputError(`Meja "${query.trim() || "?"}" tidak ada. Pilih dari daftar.`);
      return;
    }
    onPick(tableNumber);
  }

  const busy = pendingTable !== null;

  const picker = (
    <div
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Pilih meja untuk dipesankan"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90svh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-garage-line bg-garage-bg-1 sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-garage-line px-4 py-3">
          <h2 className="text-[16px] font-bold text-white">Pesankan untuk meja</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-md text-white ring-1 ring-white/12 hover:bg-white/10"
            aria-label="Tutup pemilih meja"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submitNumber} className="flex gap-2 px-4 pt-3">
          <label htmlFor="waiter-table-input" className="sr-only">
            Ketik nomor meja
          </label>
          <input
            ref={inputRef}
            id="waiter-table-input"
            inputMode="numeric"
            enterKeyHint="go"
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value.replace(/[^\d]/g, "").slice(0, 2));
              setInputError(null);
            }}
            placeholder="Ketik nomor meja"
            className="h-12 min-w-0 flex-1 rounded-md border border-garage-line-2 bg-garage-bg-0 px-3 font-mono text-[18px] text-white placeholder:font-sans placeholder:text-[14px] placeholder:text-garage-mute focus:border-white focus:outline-none"
            disabled={busy}
            aria-invalid={Boolean(inputError)}
            aria-describedby={inputError ? "waiter-table-input-error" : undefined}
          />
          <button
            type="submit"
            disabled={busy || !query}
            className="h-12 shrink-0 rounded-md bg-[#d11a2a] px-4 text-[14px] font-bold text-white transition hover:bg-[#ff2a3a] disabled:opacity-50"
          >
            Buka menu
          </button>
        </form>
        {inputError ? (
          <p id="waiter-table-input-error" className="px-4 pt-1.5 text-[12px] text-[#ffb3b3]" role="alert">
            {inputError}
          </p>
        ) : null}

        <ul className="flex flex-wrap gap-x-3 gap-y-1 px-4 pt-3 text-[11px] text-garage-dim" aria-label="Keterangan warna meja">
          {TABLE_LEGEND.map((item) => (
            <li key={item.label} className="inline-flex items-center gap-1.5">
              <span className={`size-3 rounded-[3px] ${item.swatch}`} aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>

        <div className="garage-scroll grid flex-1 grid-cols-5 gap-2 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:grid-cols-6">
          {activeTables.length === 0 ? (
            <p className="col-span-full flex items-center gap-2 py-6 text-[13px] text-garage-dim" role="status">
              <Loader2 size={15} className="animate-spin" /> Memuat daftar meja…
            </p>
          ) : null}
          {activeTables.map((row) => {
            const tone = tableTone(row);
            const warn = isDirtyTable(row) || isCleaningTable(row) || row.status === "reserved";
            const opening = pendingTable === row.tableNumber;
            return (
              <button
                key={row.tableNumber}
                type="button"
                disabled={busy}
                onClick={() => onPick(row.tableNumber)}
                className={`relative flex min-h-14 flex-col items-center justify-center rounded-md border font-mono text-[18px] font-black text-white transition hover:brightness-125 disabled:cursor-wait ${tone.card} ${
                  busy && !opening ? "opacity-50" : ""
                }`}
                aria-label={`${row.tableLabel}, ${tone.label}${warn ? " — cek dulu sebelum mendudukkan tamu" : ""}`}
              >
                {opening ? <Loader2 size={18} className="animate-spin" aria-hidden /> : row.tableNumber}
                <span className={`max-w-full truncate px-0.5 font-sans text-[10px] font-semibold leading-tight ${tone.labelColor}`}>
                  {tone.short}
                </span>
              </button>
            );
          })}
        </div>
        <p className="border-t border-garage-line px-4 py-2.5 text-[12px] text-garage-dim">
          Pesanan masuk ke kasir untuk divalidasi. Meja terisi = pesanan tambahan.
        </p>
      </div>
    </div>
  );

  // Portal ke <body> agar di atas tombol chat (lihat catatan di detail meja).
  return typeof document === "undefined" ? picker : createPortal(picker, document.body);
}

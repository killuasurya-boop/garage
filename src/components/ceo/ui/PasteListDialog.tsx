"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ClipboardPaste, X } from "lucide-react";

import { markDuplicateNames, PASTE_MAX_ROWS, type PastedRow } from "@/lib/paste-list";

// "Tempel daftar" (Owner 17 Nov 2026): tempel dari Excel/Sheets/WhatsApp → pratinjau + kesalahan per baris → simpan semua.
// Server memeriksa ulang; satu baris salah = tidak ada yang disimpan. Nama yang sudah ada dilewati (tidak dobel).

export type PasteResult = { created: string[]; skipped: string[] };

export function PasteListDialog<T extends { name: string }>({
  title,
  intro,
  columns,
  example,
  parse,
  options,
  onSubmit,
  onClose,
  onDone,
}: {
  title: string;
  intro: string;
  columns: readonly string[];
  example: string;
  parse: (text: string) => PastedRow<T>[];
  options?: ReactNode;
  onSubmit: (rows: Array<T & { line: number }>) => Promise<PasteResult>;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(() => markDuplicateNames(parse(text)), [parse, text]);
  const bad = rows.filter((r) => r.errors.length);
  const tooMany = rows.length > PASTE_MAX_ROWS;
  const canSave = rows.length > 0 && !bad.length && !tooMany && !busy;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await onSubmit(rows.map((r) => ({ ...(r.value as T), line: r.line })));
      const parts = [
        res.created.length ? `${res.created.length} tersimpan` : null,
        res.skipped.length ? `${res.skipped.length} sudah ada, dilewati (${res.skipped.join(", ")})` : null,
      ].filter(Boolean);
      onDone(parts.length ? `Tempel daftar: ${parts.join(" · ")}.` : "Tidak ada yang disimpan.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-lg border border-white/15 bg-[var(--garage-bg-2)] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-zinc-50">
            <ClipboardPaste size={18} className="text-amber-300" aria-hidden /> {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="inline-flex size-9 items-center justify-center rounded-md border border-white/15 text-zinc-200 hover:bg-white/10">
            <X size={16} />
          </button>
        </div>
        <div className="grid gap-3">
          <p className="text-sm text-zinc-300">{intro}</p>
          <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">
            <p className="font-semibold text-zinc-200">Urutan kolom</p>
            <p className="mt-0.5 font-mono text-amber-200">{columns.join("  |  ")}</p>
            <p className="mt-1">Kolom boleh kosong kecuali Nama. Baris judul &amp; nomor urut boleh ikut tertempel. Pemisah: tab (Excel), titik koma, “|”, atau “ - ” (WhatsApp).</p>
          </div>
          <label className="grid gap-1 text-xs font-semibold text-zinc-300" htmlFor="paste-list-text">
            Tempel di sini
            <textarea
              id="paste-list-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={example}
              rows={6}
              className="min-h-32 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 font-mono text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none"
            />
          </label>
          <button type="button" className="justify-self-start text-xs text-amber-300 underline-offset-2 hover:underline" onClick={() => setText(example)}>
            Isi dengan contoh
          </button>
          {options}

          {rows.length ? (
            <div className="grid gap-1.5">
              <p className={`flex items-center gap-1.5 text-sm font-semibold ${bad.length || tooMany ? "text-amber-200" : "text-emerald-200"}`} role="status">
                {bad.length || tooMany ? <AlertTriangle size={15} aria-hidden /> : <CheckCircle2 size={15} aria-hidden />}
                {tooMany
                  ? `${rows.length} baris, maksimal ${PASTE_MAX_ROWS} sekali tempel.`
                  : bad.length
                    ? `${rows.length} baris · ${bad.length} perlu diperbaiki`
                    : `${rows.length} baris siap disimpan`}
              </p>
              <div className="max-h-72 overflow-auto rounded-md border border-white/10">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="sticky top-0 bg-[var(--garage-bg-2)] text-xs uppercase text-zinc-400">
                    <tr>
                      <th className="px-2 py-1.5">Baris</th>
                      {columns.map((c) => (
                        <th key={c} className="px-2 py-1.5">
                          {c}
                        </th>
                      ))}
                      <th className="px-2 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const cells = /^#?\d{1,3}[.)]?$/.test(row.cells[0] ?? "") && row.cells.length > 1 ? row.cells.slice(1) : row.cells;
                      return (
                        <tr key={row.line} className="border-t border-white/10 align-top">
                          <td className="px-2 py-1.5 font-mono text-xs text-zinc-400">{row.line}</td>
                          {columns.map((c, i) => (
                            <td key={c} className="max-w-[14rem] break-words px-2 py-1.5 text-zinc-100">
                              {cells[i] || <span className="text-zinc-500">—</span>}
                            </td>
                          ))}
                          <td className="px-2 py-1.5">
                            {row.errors.length ? (
                              <ul className="grid gap-0.5 text-xs text-amber-200">
                                {row.errors.map((er) => (
                                  <li key={er}>• {er}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-200">
                                <CheckCircle2 size={12} aria-hidden /> OK
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center rounded-md border border-white/15 px-4 text-sm text-zinc-100 hover:bg-white/10">
              Batal
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!canSave}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[var(--garage-red)] px-4 text-sm font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Menyimpan…" : `Simpan ${rows.length && !bad.length ? rows.length : ""} baris`.replace("  ", " ")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileDown, Loader2, Upload, X } from "lucide-react";

import type { ImportRowResult } from "@/lib/bulk-import";

export type BulkImportSummaryItem = { label: string; value: number; tone?: "good" | "warn" | "bad" | "muted" };

export type BulkImportConfig<T extends { rows: ImportRowResult[]; mapping: Record<string, string>; ignored: string[] }> = {
  title: string;
  description: string;
  endpoint: string;
  templates: Array<{ label: string; href: string }>;
  summarize: (result: T) => BulkImportSummaryItem[];
  /** Jumlah perubahan yang akan disimpan (0 = tombol simpan nonaktif). */
  pendingChanges: (result: T) => number;
  variant?: "dark" | "light";
};

const ACTION_LABEL: Record<ImportRowResult["action"], string> = {
  create: "Baru",
  update: "Diubah",
  unchanged: "Tetap",
  error: "Error",
};

/**
 * Dialog impor massal: unduh template → pilih file (.xlsx/.csv) → pratinjau
 * per baris (baru / diubah / tetap / error + alasan) → konfirmasi → ringkasan
 * hasil dari server. Tidak ada notifikasi sukses sebelum server menyimpan.
 */
export function BulkImportDialog<T extends { rows: ImportRowResult[]; mapping: Record<string, string>; ignored: string[] }>({
  config,
  onClose,
  onImported,
}: {
  config: BulkImportConfig<T>;
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<T | null>(null);
  const [saved, setSaved] = useState<T | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "error" | "changes">("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const light = config.variant === "light";

  const theme = light
    ? {
        panel: "border-[#E8E8E8] bg-white text-[#111111]",
        muted: "text-[#6B7280]",
        box: "border-[#E8E8E8] bg-[#F8F9FB]",
        row: "border-[#EEF0F3]",
        head: "bg-[#F3F4F6] text-[#374151]",
      }
    : {
        panel: "border-[#3a3a44] bg-[#16161c] text-[#f4f4f5]",
        muted: "text-[#c4c4cc]",
        box: "border-[#34343c] bg-[#1d1d24]",
        row: "border-[#2a2a32]",
        head: "bg-[#22222a] text-[#e4e4e8]",
      };
  const toneClass: Record<NonNullable<BulkImportSummaryItem["tone"]>, string> = light
    ? { good: "text-[#15803d]", warn: "text-[#b45309]", bad: "text-[#DC2626]", muted: "text-[#6B7280]" }
    : { good: "text-[#86efac]", warn: "text-[#ffd79a]", bad: "text-[#ffb4b4]", muted: "text-[#c4c4cc]" };
  const actionClass: Record<ImportRowResult["action"], string> = {
    create: toneClass.good,
    update: toneClass.warn,
    unchanged: toneClass.muted,
    error: toneClass.bad,
  };

  async function send(dryRun: boolean) {
    if (!file) return;
    setBusy(dryRun ? "preview" : "save");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("dryRun", dryRun ? "true" : "false");
      const response = await fetch(config.endpoint, { method: "POST", body: form });
      const json = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? `Impor gagal (HTTP ${response.status}).`);
      if (dryRun) {
        setPreview(json.data);
        setFilter(json.data.rows.some((r) => r.action === "error") ? "error" : "all");
      } else {
        setSaved(json.data);
        onImported();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impor gagal.");
    } finally {
      setBusy(null);
    }
  }

  const shown = (saved ?? preview)?.rows.filter((row) =>
    filter === "error" ? row.action === "error" : filter === "changes" ? row.action === "create" || row.action === "update" : true,
  );
  const result = saved ?? preview;
  const pending = preview ? config.pendingChanges(preview) : 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label={config.title} onClick={onClose}>
      <div className={`flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl border shadow-2xl ${theme.panel}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-current/10 p-4">
          <div className="min-w-0">
            <p className="text-base font-bold">{config.title}</p>
            <p className={`mt-0.5 text-sm ${theme.muted}`}>{config.description}</p>
          </div>
          <button type="button" aria-label="Tutup" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-black/10">
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {!saved ? (
            <>
              <div className="flex flex-wrap gap-2">
                {config.templates.map((template) => (
                  <a key={template.href} href={template.href} className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold ${theme.box}`}>
                    <FileDown className="size-4" aria-hidden /> {template.label}
                  </a>
                ))}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                  setError(null);
                }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex min-h-12 w-full items-center gap-2 rounded-md border border-dashed border-[#c41a1a]/60 bg-[#c41a1a]/10 px-3 text-left text-sm font-semibold"
              >
                <Upload className="size-4 shrink-0 text-[#e83030]" aria-hidden />
                <span className="truncate">{file ? `${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)` : "Pilih file .xlsx atau .csv"}</span>
              </button>
              {file && !preview ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void send(true)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#2F3136] text-sm font-bold text-white hover:bg-black disabled:opacity-50"
                >
                  {busy === "preview" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {busy === "preview" ? "Memeriksa file…" : "Pratinjau & validasi"}
                </button>
              ) : null}
            </>
          ) : (
            <p className={`flex items-center gap-2 text-sm font-semibold ${toneClass.good}`} role="status">
              <CheckCircle2 className="size-4" aria-hidden /> Impor tersimpan. Ringkasan di bawah berasal dari server.
            </p>
          )}

          {result ? (
            <div className={`space-y-3 rounded-lg border p-3 ${theme.box}`}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {config.summarize(result).map((item) => (
                  <div key={item.label} className="min-w-0">
                    <p className={`text-xs ${theme.muted}`}>{item.label}</p>
                    <p className={`text-lg font-bold ${toneClass[item.tone ?? "muted"]}`}>{item.value}</p>
                  </div>
                ))}
              </div>
              {Object.keys(result.mapping).length ? (
                <p className={`text-xs ${theme.muted}`}>
                  Kolom terbaca: {Object.values(result.mapping).join(", ")}
                  {result.ignored.length ? ` · diabaikan: ${result.ignored.join(", ")}` : ""}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1" role="group" aria-label="Saring baris">
                {(
                  [
                    ["all", "Semua"],
                    ["changes", "Baru & diubah"],
                    ["error", "Error"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={filter === id}
                    onClick={() => setFilter(id)}
                    className={`min-h-8 rounded-md px-3 text-xs font-semibold ${filter === id ? "bg-[#f5a742] text-black" : `border ${theme.row}`}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={`max-h-[38vh] overflow-auto rounded-md border ${theme.row}`}>
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className={`sticky top-0 ${theme.head}`}>
                    <tr>
                      <th className="px-2 py-2 font-semibold">Baris</th>
                      <th className="px-2 py-2 font-semibold">Kode</th>
                      <th className="px-2 py-2 font-semibold">Nama</th>
                      <th className="px-2 py-2 font-semibold">Status</th>
                      <th className="px-2 py-2 font-semibold">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown?.length ? (
                      shown.map((row) => (
                        <tr key={row.row} className={`border-t align-top ${theme.row}`}>
                          <td className="px-2 py-1.5 tabular-nums">{row.row}</td>
                          <td className="px-2 py-1.5 font-mono text-xs">{row.key}</td>
                          <td className="px-2 py-1.5">{row.name || "—"}</td>
                          <td className={`px-2 py-1.5 font-semibold ${actionClass[row.action]}`}>{ACTION_LABEL[row.action]}</td>
                          <td className="px-2 py-1.5 text-xs">{row.message ?? row.changes?.join(" · ") ?? ""}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className={`px-2 py-3 text-center text-sm ${theme.muted}`}>
                          Tidak ada baris untuk filter ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className={`flex items-start gap-2 text-sm ${toneClass.bad}`} role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-current/10 p-4">
          {preview && !saved ? (
            <>
              <p className={`mr-auto text-xs ${theme.muted}`}>
                {preview.rows.some((r) => r.action === "error") ? "Baris error tidak disimpan. " : ""}Semua perubahan disimpan sekaligus (satu transaksi).
              </p>
              <button type="button" onClick={() => { setFile(null); setPreview(null); }} className={`min-h-10 rounded-md border px-3 text-sm font-semibold ${theme.row}`}>
                Ganti file
              </button>
              <button
                type="button"
                disabled={busy !== null || pending === 0}
                onClick={() => void send(false)}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#c41a1a] px-4 text-sm font-bold text-white hover:bg-[#e83030] disabled:opacity-50"
              >
                {busy === "save" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {busy === "save" ? "Menyimpan…" : pending ? `Simpan ${pending} perubahan` : "Tidak ada perubahan"}
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} className={`min-h-10 rounded-md border px-4 text-sm font-semibold ${theme.row}`}>
              {saved ? "Selesai" : "Tutup"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Download, FileUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { GuestImportRow } from "@/lib/event-invitations";

type ImportResult = {
  dryRun: boolean;
  committed: number;
  summary: { total: number; valid: number; duplicate: number; invalid: number };
  ignoredColumns: string[];
  rows: GuestImportRow[];
};

const ACTION_LABEL: Record<GuestImportRow["action"], { text: string; className: string }> = {
  create: { text: "Valid", className: "text-garage-success" },
  duplicate: { text: "Duplikat", className: "text-garage-amber" },
  error: { text: "Tidak valid", className: "text-garage-red-bright" },
};

// Impor tamu CSV/XLSX: pratinjau dulu (dry-run), simpan hanya baris valid setelah dikonfirmasi.
export function EventImportPanel({ eventId, onImported }: { eventId: string; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function send(dryRun: boolean) {
    if (!file) return;
    setBusy(dryRun ? "preview" : "commit");
    setMessage(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("dryRun", String(dryRun));
      const res = await fetch(`/api/events/${eventId}/guests/import`, { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "File gagal diproses.");
      const result = json.data as ImportResult;
      if (dryRun) {
        setPreview(result);
      } else {
        setPreview(null);
        setFile(null);
        setMessage({ tone: "ok", text: `${result.committed} tamu disimpan. Baris duplikat/tidak valid tidak ikut disimpan.` });
        onImported();
      }
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "File gagal diproses." });
    } finally {
      setBusy(null);
    }
  }

  function commit() {
    if (!preview) return;
    const skipped = preview.summary.duplicate + preview.summary.invalid;
    const text = `Simpan ${preview.summary.valid} tamu valid?${skipped ? ` ${skipped} baris duplikat/tidak valid akan dilewati.` : ""}`;
    if (window.confirm(text)) void send(false);
  }

  return (
    <div className="grid gap-4" data-testid="event-import">
      <div className="rounded-lg border border-garage-line bg-garage-bg-2 p-4 text-sm text-garage-dim">
        <p className="text-base font-bold text-garage-fg">Impor daftar tamu (.csv / .xlsx)</p>
        <p className="mt-1">
          Kolom: <b className="text-garage-fg">Nama</b> (wajib), WhatsApp, Jumlah orang, Catatan. Maks 2000 baris / 5 MB. Nomor yang sudah terdaftar
          atau ganda di file ditandai duplikat dan tidak disimpan.
        </p>
        <Button asChild variant="outline" className="mt-3">
          <a href={`/api/events/${eventId}/guests/import`}>
            <Download className="size-4" /> Unduh template CSV
          </a>
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="file"
          accept=".csv,.xlsx"
          aria-label="Pilih file tamu"
          data-testid="import-file"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setMessage(null);
          }}
          className="text-sm text-garage-fg file:mr-3 file:rounded-md file:border file:border-garage-line-2 file:bg-garage-bg-2 file:px-3 file:py-2 file:text-garage-fg"
        />
        <Button disabled={!file || busy !== null} onClick={() => void send(true)} data-testid="import-preview">
          {busy === "preview" ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Pratinjau
        </Button>
      </div>

      {message ? (
        <p role="status" className={`text-sm font-semibold ${message.tone === "ok" ? "text-garage-success" : "text-garage-red-bright"}`}>
          {message.text}
        </p>
      ) : null}

      {preview ? (
        <div className="grid gap-3" data-testid="import-summary">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-md border border-garage-line px-3 py-1.5">Total {preview.summary.total}</span>
            <span className="rounded-md border border-garage-success/50 px-3 py-1.5 text-garage-success">Valid {preview.summary.valid}</span>
            <span className="rounded-md border border-garage-amber/50 px-3 py-1.5 text-garage-amber">Duplikat {preview.summary.duplicate}</span>
            <span className="rounded-md border border-garage-red/50 px-3 py-1.5 text-garage-red-bright">Tidak valid {preview.summary.invalid}</span>
          </div>
          {preview.ignoredColumns.length ? (
            <p className="text-xs text-garage-dim">Kolom diabaikan: {preview.ignoredColumns.join(", ")}</p>
          ) : null}
          <div className="max-h-[45vh] overflow-auto rounded-lg border border-garage-line">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 bg-garage-bg-3 text-xs uppercase text-garage-dim">
                <tr>
                  <th className="px-3 py-2">Baris</th>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">WhatsApp</th>
                  <th className="px-3 py-2">Hasil</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row} className="border-t border-garage-line">
                    <td className="px-3 py-1.5 tabular-nums text-garage-dim">{row.row}</td>
                    <td className="px-3 py-1.5 text-garage-fg">{row.name}</td>
                    <td className="px-3 py-1.5 text-garage-dim">{row.phone ?? "—"}</td>
                    <td className={`px-3 py-1.5 font-semibold ${ACTION_LABEL[row.action].className}`}>
                      {ACTION_LABEL[row.action].text}
                      {row.message ? <span className="block text-xs font-normal text-garage-dim">{row.message}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button className="w-fit" disabled={busy !== null || preview.summary.valid === 0} onClick={commit} data-testid="import-commit">
            {busy === "commit" ? <Loader2 className="size-4 animate-spin" /> : null} Simpan {preview.summary.valid} tamu valid
          </Button>
        </div>
      ) : null}
    </div>
  );
}

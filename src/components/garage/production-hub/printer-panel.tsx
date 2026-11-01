"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Printer, RotateCcw } from "lucide-react";

import { StationPrintPanel } from "@/components/garage/station-print-panel";
import type { ProductionTicketView } from "@/lib/garage-api-types";
import {
  COMPLETION_STATUS_LABEL,
  type CompletionPrintView,
} from "@/lib/production-completion-print-rules";

import { tableText } from "./order-card";
import { devicePrinterAutoCapable, type CompletionPrintNotice } from "./use-completion-print";

const DevicePrinterPanel = dynamic(
  () => import("@/components/garage/device-printer-panel").then((m) => m.DevicePrinterPanel),
  { ssr: false },
);

const STATUS_STYLE: Record<string, string> = {
  pending: "text-[var(--phv4-wait)]",
  printing: "text-[#93c5fd]",
  printed: "text-[#86efac]",
  failed: "text-[#fca5a5]",
};

export function AutoPrintSwitch({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Auto print tiket selesai di perangkat ini"
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
        on ? "border-[var(--phv4-success)] bg-[var(--phv4-success)]/80" : "border-[var(--phv4-border)] bg-[var(--phv4-bg)]"
      }`}
    >
      <span className={`absolute top-0.5 size-[18px] rounded-full bg-white transition-[left] ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

/**
 * Printer: Auto Print tiket SELESAI (antrean server, anti-dobel), status tiap job,
 * antre ulang job gagal, cetak ulang terkendali (alasan), printer perangkat, dan
 * cetak chit produksi via RawBT (panel lama).
 */
export function PrinterPanel({
  jobs,
  autoPrint,
  onAutoPrint,
  busyId,
  notice,
  tickets,
  chitStation,
  canWrite,
  onRetry,
  onPrintNow,
  onReprint,
  onChanged,
}: {
  jobs: CompletionPrintView[];
  autoPrint: boolean;
  onAutoPrint: (next: boolean) => void;
  busyId: string | null;
  notice: CompletionPrintNotice | null;
  tickets: ProductionTicketView[];
  chitStation: "Bar" | "Food" | "all";
  canWrite: boolean;
  onRetry: (job: CompletionPrintView) => Promise<void>;
  onPrintNow: (job: CompletionPrintView) => void;
  onReprint: (orderId: string, reason: string) => Promise<boolean>;
  onChanged: () => void;
}) {
  const [reprintFor, setReprintFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showDevice, setShowDevice] = useState(false);
  const capable = devicePrinterAutoCapable();
  const pending = jobs.filter((j) => j.status === "pending" || j.status === "printing").length;
  const failed = jobs.filter((j) => j.status === "failed").length;

  return (
    <div className="space-y-3">
      <section className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] p-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">Auto Print tiket SELESAI</p>
            <p className="text-[12px] text-[var(--phv4-muted)]">
              Satu tiket per order saat semua item Bar + Dapur selesai. Nyalakan di SATU perangkat yang terhubung printer.
            </p>
          </div>
          <AutoPrintSwitch on={autoPrint} onChange={onAutoPrint} />
        </div>
        <p className={`mt-2 text-[12px] font-semibold ${capable.ok ? "text-[#d1d5db]" : "text-[#fca5a5]"}`}>
          Printer perangkat: {capable.label}
          {capable.ok ? "" : " — pilih printer langsung/agen agar bisa otomatis (tanpa dialog Chrome)."}
        </p>
        <p className="mt-1 text-[12px] text-[var(--phv4-muted)]">
          Antre {pending} · Gagal {failed} · Tersimpan di server — aman bila printer offline.
        </p>
        {notice ? (
          <p className={`mt-1 text-[12px] font-semibold ${notice.tone === "ok" ? "text-[#86efac]" : "text-[#fca5a5]"}`} role="status">
            {notice.text}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setShowDevice((v) => !v)}
          className="mt-2 h-8 rounded-[6px] border border-[var(--phv4-border)] px-2.5 text-[12px] font-semibold hover:bg-white/5"
        >
          {showDevice ? "Tutup pengaturan printer" : "Atur printer perangkat ini"}
        </button>
        {showDevice ? (
          <div className="mt-2">
            <DevicePrinterPanel compact />
          </div>
        ) : null}
      </section>

      <section aria-label="Antrean tiket selesai" className="space-y-1.5">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--phv4-muted)]">Tiket SELESAI (12 jam)</h3>
        {jobs.length ? (
          jobs.map((job) => (
            <div key={job.id} className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <Printer className="size-3.5 shrink-0 text-[var(--phv4-muted)]" aria-hidden />
                <span className="phv4-mono text-[13px] font-bold">#{job.orderNo ?? "-"}</span>
                <span className="truncate text-[12px] text-[#d1d5db]">{tableText(job.tableLabel ?? "")}</span>
                {job.reprint ? (
                  <span className="rounded border border-[var(--phv4-border)] px-1 text-[10px] font-bold">
                    ULANG {job.payload.reprint?.sequence ?? ""}
                  </span>
                ) : null}
                <span className={`ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] font-bold ${STATUS_STYLE[job.status]}`}>
                  {busyId === job.id || job.status === "printing" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : job.status === "printed" ? (
                    <CheckCircle2 className="size-3" />
                  ) : job.status === "failed" ? (
                    <AlertTriangle className="size-3" />
                  ) : null}
                  {COMPLETION_STATUS_LABEL[job.status]}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-[var(--phv4-muted)]">
                {job.attempts}x percobaan
                {job.claimedBy ? ` · ${job.claimedBy}` : ""}
                {job.printedAt
                  ? ` · ${new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(job.printedAt))}`
                  : ""}
              </p>
              {job.error ? <p className="mt-0.5 text-[11px] font-semibold text-[#fca5a5]">{job.error}</p> : null}
              {canWrite ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {job.status === "failed" ? (
                    <button
                      type="button"
                      onClick={() => void onRetry(job)}
                      className="inline-flex h-8 items-center gap-1 rounded-[6px] bg-[var(--phv4-red)] px-2.5 text-[12px] font-bold text-white"
                    >
                      <RotateCcw className="size-3.5" /> Antre ulang
                    </button>
                  ) : null}
                  {job.status === "pending" && capable.ok ? (
                    <button
                      type="button"
                      disabled={Boolean(busyId)}
                      onClick={() => onPrintNow(job)}
                      className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-[var(--phv4-border)] px-2.5 text-[12px] font-semibold disabled:opacity-50"
                    >
                      <Printer className="size-3.5" /> Cetak di sini
                    </button>
                  ) : null}
                  {(job.status === "printed" || job.status === "failed") && job.orderId ? (
                    reprintFor === job.id ? (
                      <div className="flex w-full gap-1.5">
                        <input
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="Alasan cetak ulang"
                          aria-label="Alasan cetak ulang"
                          className="h-8 min-w-0 flex-1 rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 text-[12px] outline-none focus:border-[var(--phv4-red)]"
                        />
                        <button
                          type="button"
                          disabled={reason.trim().length < 3}
                          onClick={async () => {
                            if (await onReprint(job.orderId as string, reason.trim())) {
                              setReprintFor(null);
                              setReason("");
                            }
                          }}
                          className="h-8 shrink-0 rounded-[6px] bg-[var(--phv4-red)] px-2.5 text-[12px] font-bold text-white disabled:opacity-50"
                        >
                          Cetak ulang
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setReprintFor(job.id);
                          setReason("");
                        }}
                        className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-[var(--phv4-border)] px-2.5 text-[12px] font-semibold"
                      >
                        Cetak ulang…
                      </button>
                    )
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-[12px] text-[var(--phv4-muted)]">Belum ada order selesai dalam 12 jam terakhir.</p>
        )}
      </section>

      <section aria-label="Chit produksi" className="space-y-1.5">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--phv4-muted)]">Chit produksi (RawBT)</h3>
        <StationPrintPanel tickets={tickets} station={chitStation} onPrinted={onChanged} />
      </section>
    </div>
  );
}

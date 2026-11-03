"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { garageApi } from "@/lib/api-client";
import { DEVICE_PRINTER_MODE_LABELS, loadDevicePrinterConfig } from "@/lib/device-printer";
import { deliverPrintContent, probeAutoPrinter } from "@/lib/print-client";
import {
  buildCompletionTicketContent,
  canAutoPrintJob,
  type CompletionPrintView,
} from "@/lib/production-completion-print-rules";

// Perangkat pencetak tiket SELESAI (Production Hub V4). Hanya perangkat yang
// menyalakan "Auto Print" yang mengklaim job; server menjamin satu perangkat
// per job. Cetak lewat layanan printer perangkat (print-client.ts) TANPA dialog
// print Chrome — job tetap di antrean server bila printer offline.

const ENABLED_KEY = "garage:completion-autoprint";
const DEVICE_KEY = "garage:device-id";
const TICK_MS = 3000;
const PROBE_TTL_MS = 20_000;

export type CompletionPrintNotice = { tone: "ok" | "error"; text: string; at: number };

function readEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) === "on";
  } catch {
    return false;
  }
}

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `dev-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "dev-tanpa-storage";
  }
}

/** Mode printer perangkat ini bisa dipakai cetak otomatis (bukan dialog Chrome). */
export function devicePrinterAutoCapable() {
  const config = loadDevicePrinterConfig();
  return {
    ok: config.mode !== "browser",
    label: config.deviceLabel || DEVICE_PRINTER_MODE_LABELS[config.mode],
  };
}

export function useCompletionPrintWorker(
  jobs: CompletionPrintView[],
  deviceLabel: string,
  onChanged: () => void,
) {
  const [enabled, setEnabled] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<CompletionPrintNotice | null>(null);
  const [printerReady, setPrinterReady] = useState<boolean | null>(null);
  const busyRef = useRef(false);
  const probeRef = useRef<{ at: number; ready: boolean; reason: string | null }>({ at: 0, ready: false, reason: null });
  const jobsRef = useRef(jobs);
  const onChangedRef = useRef(onChanged);

  useEffect(() => {
    jobsRef.current = jobs;
    onChangedRef.current = onChanged;
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- init sekali dari storage
    setEnabled(readEnabled());
  }, []);

  const toggle = useCallback((next: boolean) => {
    setEnabled(next);
    try {
      localStorage.setItem(ENABLED_KEY, next ? "on" : "off");
    } catch {
      /* abaikan */
    }
  }, []);

  /** Klaim → cetak → lapor. Gagal klaim (diambil perangkat lain) bukan error. */
  const printJob = useCallback(
    async (job: CompletionPrintView) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusyId(job.id);
      let token: string | null = null;
      try {
        const claim = await garageApi.post<{ token: string }>(
          `/api/production/completion-prints/${job.id}`,
          { action: "claim", device: `${deviceLabel} · ${deviceId()}`.slice(0, 80) },
        );
        token = claim.token;
      } catch {
        busyRef.current = false;
        setBusyId(null);
        onChangedRef.current();
        return;
      }
      let ok = false;
      let error: string | null = null;
      let printer: string | null = null;
      try {
        const config = loadDevicePrinterConfig();
        if (config.mode === "browser") {
          error = "Printer perangkat = dialog Chrome; pilih printer langsung/agen untuk cetak otomatis.";
        } else {
          const res = await deliverPrintContent((width) => buildCompletionTicketContent(job.payload, width), {
            copies: 1,
            config,
            browserFallback: false,
          });
          const body = (await res.json().catch(() => ({}))) as {
            printer?: string;
            error?: { message?: string; title?: string };
          };
          ok = res.ok;
          printer = body.printer ?? null;
          if (!ok) error = body.error?.title ?? body.error?.message ?? `Printer menolak (${res.status}).`;
        }
      } catch (err) {
        error = err instanceof Error ? err.message : "Gagal mengirim ke printer.";
      }
      try {
        await garageApi.post(`/api/production/completion-prints/${job.id}`, {
          action: "result",
          token,
          ok,
          error,
          printer,
        });
        setNotice({
          tone: ok ? "ok" : "error",
          text: ok
            ? `Tiket selesai #${job.orderNo ?? ""} tercetak.`
            : `Tiket selesai #${job.orderNo ?? ""} gagal: ${error ?? "printer"}`,
          at: Date.now(),
        });
      } catch {
        // Hasil tidak terlapor → server menandai "tidak pasti" setelah klaim habis (tidak dicetak ulang otomatis).
        setNotice({ tone: "error", text: "Hasil cetak gagal dilaporkan ke server.", at: Date.now() });
      } finally {
        busyRef.current = false;
        setBusyId(null);
        onChangedRef.current();
      }
    },
    [deviceLabel],
  );

  useEffect(() => {
    if (!enabled) return;
    const tick = async () => {
      if (busyRef.current || (typeof document !== "undefined" && document.hidden)) return;
      if (!devicePrinterAutoCapable().ok) return;
      const now = Date.now();
      const next = [...jobsRef.current]
        .reverse()
        .find((job) => canAutoPrintJob(job, now));
      if (!next) return;
      // Klaim hanya bila printer terbukti siap (cache 20 dtk) — tablet tanpa printer
      // tidak boleh mengambil job lalu menghabiskan jatah percobaannya.
      if (now - probeRef.current.at > PROBE_TTL_MS) {
        probeRef.current = { at: now, ...(await probeAutoPrinter().catch(() => ({ ready: false, reason: null }))) };
        setPrinterReady(probeRef.current.ready);
      }
      if (!probeRef.current.ready || busyRef.current) return;
      void printJob(next);
    };
    void tick();
    const id = window.setInterval(() => void tick(), TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled, printJob, jobs]);

  return { enabled, toggle, busyId, notice, printerReady, printNow: printJob };
}

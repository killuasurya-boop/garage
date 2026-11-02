// =============================================================================
// Production Hub V4 — tiket SELESAI (completion ticket). Aturan murni (tanpa DB)
// yang dipakai server (antrean `print_jobs`) dan perangkat pencetak (browser).
//
// Tiket selesai ≠ chit produksi: dicetak SEKALI per order saat SEMUA tiket
// Bar + Dapur yang wajib sudah READY/diantar. Server menyimpan job di
// `print_jobs` (durable); perangkat dengan "Auto Print" mengklaim job secara
// atomik lalu mengirimnya lewat layanan printer perangkat (print-client.ts).
//
// Anti-dobel:
//   - satu job per order (enqueue idempoten, dikunci per order);
//   - klaim atomik pending → printing (dua perangkat tidak mencetak job sama);
//   - gagal PASTI (printer menolak / offline) → kembali pending, dicoba ulang;
//   - klaim kedaluwarsa (perangkat hilang saat mencetak) → TIDAK dicoba ulang
//     otomatis karena mungkin sudah tercetak; staf memutuskan lewat "Cetak ulang".
// =============================================================================

import { paperColumns, wrapText } from "@/lib/receipt-layout";

export const COMPLETION_JOB_TYPE = "order_completion";
export const COMPLETION_REPRINT_JOB_TYPE = "order_completion_reprint";
export const COMPLETION_JOB_TYPES = [COMPLETION_JOB_TYPE, COMPLETION_REPRINT_JOB_TYPE] as const;
export const COMPLETION_TARGET = "completion";

/** Lama klaim cetak berlaku sebelum dianggap "tidak pasti". */
export const COMPLETION_CLAIM_LEASE_MS = 90_000;
/** Gagal pasti sebanyak ini → berhenti otomatis, tunggu tindakan staf. */
export const COMPLETION_MAX_AUTO_ATTEMPTS = 5;
/** Kasir/produksi boleh cetak ulang maks. sekian kali per order; Owner/Manajer bebas (diaudit). */
export const COMPLETION_STAFF_REPRINT_LIMIT = 3;
/** Job lebih tua dari ini tidak lagi dicetak otomatis (mis. perangkat mati semalam). */
export const COMPLETION_AUTO_PRINT_MAX_AGE_MS = 6 * 60 * 60_000;

export type CompletionPrintStatus = "pending" | "printing" | "printed" | "failed";

export type CompletionTicketItem = {
  station: "Bar" | "Dapur";
  label: string;
  qty: number;
  note: string | null;
};

export type CompletionTicketPayload = {
  orderId: string;
  orderNo: string;
  queueNo: number | null;
  tableLabel: string;
  channel: string;
  customerName: string | null;
  orderedAt: string;
  completedAt: string;
  items: CompletionTicketItem[];
  stations: Array<{ station: "Bar" | "Dapur"; readyAt: string | null; readyByName: string | null }>;
  reprint?: { sequence: number; reason: string; byName: string } | null;
};

export type CompletionPrintView = {
  id: string;
  jobType: string;
  reprint: boolean;
  orderId: string | null;
  orderNo: string | null;
  tableLabel: string | null;
  status: CompletionPrintStatus;
  attempts: number;
  error: string | null;
  printedAt: string | null;
  claimedBy: string | null;
  createdAt: string;
  updatedAt: string;
  payload: CompletionTicketPayload;
};

/** Order dianggap SELESAI produksi bila setiap tiket hidup sudah ready/delivered. */
export function isOrderProductionComplete(ticketStatuses: string[]): boolean {
  const live = ticketStatuses.filter((s) => !["rejected", "canceled", "cancelled"].includes(s));
  return live.length > 0 && live.every((s) => s === "ready" || s === "delivered");
}

export function isClaimExpired(updatedAt: Date | string, now: Date, leaseMs = COMPLETION_CLAIM_LEASE_MS) {
  return now.getTime() - new Date(updatedAt).getTime() > leaseMs;
}

/**
 * Status setelah perangkat melapor gagal PASTI (job belum keluar dari printer).
 * attemptsAfter = jumlah percobaan termasuk yang barusan.
 */
export function statusAfterDefiniteFailure(attemptsAfter: number): CompletionPrintStatus {
  return attemptsAfter >= COMPLETION_MAX_AUTO_ATTEMPTS ? "failed" : "pending";
}

/** Jeda sebelum perangkat mencoba lagi job yang gagal pasti (backoff 5s → 60s). */
export function completionRetryDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(60_000, 5_000 * 2 ** (attempts - 1));
}

export function canAutoPrintJob(
  job: { status: string; attempts: number; updatedAt: string; createdAt: string },
  now: number,
): boolean {
  if (job.status !== "pending") return false;
  if (now - new Date(job.createdAt).getTime() > COMPLETION_AUTO_PRINT_MAX_AGE_MS) return false;
  return now - new Date(job.updatedAt).getTime() >= completionRetryDelayMs(job.attempts);
}

export function reprintAllowed(role: string, reprintsSoFar: number) {
  if (role === "Owner" || role === "Manajer") return { ok: true as const };
  if (reprintsSoFar >= COMPLETION_STAFF_REPRINT_LIMIT) {
    return {
      ok: false as const,
      message: `Batas cetak ulang ${COMPLETION_STAFF_REPRINT_LIMIT}x untuk order ini tercapai — minta Owner/Manajer.`,
    };
  }
  return { ok: true as const };
}

export const COMPLETION_STATUS_LABEL: Record<CompletionPrintStatus, string> = {
  pending: "Antre cetak",
  printing: "Mencetak…",
  printed: "Tercetak",
  failed: "Gagal cetak",
};

/** Teks tiket SELESAI (tanpa harga). Lebar mengikuti kertas perangkat (32/48). */
export function buildCompletionTicketContent(payload: CompletionTicketPayload, width?: number): string {
  const W = paperColumns(width);
  const clean = (value: string | null | undefined) => String(value ?? "").replace(/\s+/g, " ").trim();
  const center = (value: string) => {
    const text = clean(value).slice(0, W);
    return `${" ".repeat(Math.max(0, Math.floor((W - text.length) / 2)))}${text}`;
  };
  const time = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso))
      : "-";
  const rows: string[] = [];
  rows.push("=".repeat(W));
  rows.push(center("*** PESANAN SELESAI ***"));
  if (payload.reprint) rows.push(center(`CETAK ULANG KE-${payload.reprint.sequence}`));
  rows.push("=".repeat(W));
  if (payload.queueNo != null) rows.push(center(`ANTRIAN #${payload.queueNo}`));
  rows.push(center(`ORDER ${clean(payload.orderNo)}`));
  rows.push(center(clean(payload.tableLabel).toUpperCase() || "-"));
  const customer = clean(payload.customerName);
  if (customer && customer.toLowerCase() !== "guest customer") rows.push(center(`NAMA: ${customer.toUpperCase()}`));
  rows.push("-".repeat(W));
  for (const station of ["Bar", "Dapur"] as const) {
    const items = payload.items.filter((item) => item.station === station);
    if (!items.length) continue;
    rows.push(`[${station.toUpperCase()}]`);
    for (const item of items) {
      const prefix = `${item.qty}x `;
      wrapText(clean(item.label), W - prefix.length).forEach((part, index) =>
        rows.push(`${index === 0 ? prefix : " ".repeat(prefix.length)}${part}`),
      );
      if (clean(item.note)) {
        wrapText(`* ${clean(item.note)}`, W - prefix.length).forEach((part) =>
          rows.push(`${" ".repeat(prefix.length)}${part}`),
        );
      }
    }
  }
  rows.push("-".repeat(W));
  rows.push(`Masuk   : ${time(payload.orderedAt)}`);
  for (const s of payload.stations) {
    // Nama petugas tidak dipotong: pindah ke baris berikut (menjorok) bila tidak muat.
    const head = `${s.station.padEnd(8)}: siap ${time(s.readyAt)}`;
    const name = clean(s.readyByName);
    if (!name || head.length + 1 + name.length <= W) rows.push(name ? `${head} ${name}` : head);
    else {
      rows.push(head);
      wrapText(name, W - 10).forEach((line) => rows.push(`${" ".repeat(10)}${line}`));
    }
  }
  rows.push(`Selesai : ${time(payload.completedAt)}`);
  if (payload.reprint) {
    wrapText(`Ulang: ${clean(payload.reprint.reason)} (${clean(payload.reprint.byName)})`, W).forEach((l) => rows.push(l));
  }
  rows.push("=".repeat(W));
  return rows.join("\n");
}

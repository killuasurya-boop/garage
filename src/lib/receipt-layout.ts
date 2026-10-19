// =============================================================================
// Mesin tata letak kertas struk thermal (owner, Okt 2026): semua kertas —
// struk pelanggan, chit dapur/bar, slip tutup shift, rekap harian — dibentuk
// dengan lebar kolom yang mengikuti kertas printer perangkat.
//   58 mm → 32 kolom (RPP02N & kebanyakan printer Bluetooth)
//   80 mm → 48 kolom (printer kasir meja)
// ISOMORPHIC: hanya string ops, aman di browser & server.
// =============================================================================

export type PaperSize = "58" | "80";

export interface ReceiptLayoutOptions {
  /** Jumlah kolom karakter per baris. Default 32 (58 mm). */
  width?: number | null;
}

export const PAPER_COLUMNS: Record<PaperSize, number> = { "58": 32, "80": 48 };
export const MIN_COLUMNS = 24;
export const MAX_COLUMNS = 64;

/** Kolom aman: bilangan bulat 24–64, default 32. */
export function paperColumns(width?: number | null): number {
  const value = Math.round(Number(width));
  if (!Number.isFinite(value) || value <= 0) return PAPER_COLUMNS["58"];
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, value));
}

export function cleanText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Bungkus teks per kata ke baris ≤ width; kata yang lebih panjang dipecah. */
export function wrapText(value: string | null | undefined, width: number): string[] {
  const max = Math.max(1, width);
  const lines: string[] = [];
  let current = "";
  for (const raw of cleanText(value).split(" ")) {
    if (!raw) continue;
    let word = raw;
    while (word.length > max) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, max));
      word = word.slice(max);
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > max) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Penyusun baris dengan lebar tetap. Tidak ada baris yang melebihi W. */
export function createLayout(options: ReceiptLayoutOptions = {}) {
  const W = paperColumns(options.width);
  const rows: string[] = [];

  const center = (value: string) => {
    const text = cleanText(value).slice(0, W);
    return `${" ".repeat(Math.max(0, Math.floor((W - text.length) / 2)))}${text}`;
  };

  return {
    W,
    rows,
    text(value: string) {
      for (const line of wrapText(value, W)) rows.push(line);
    },
    center(value: string) {
      for (const line of wrapText(value, W)) rows.push(center(line));
    },
    divider(char = "-") {
      rows.push(char.repeat(W));
    },
    blank() {
      rows.push("");
    },
    /** Kiri-kanan; nilai kanan tidak pernah terpotong, label dibungkus. */
    pair(left: string, right: string) {
      const value = cleanText(right).slice(0, W);
      const labelWidth = Math.max(1, W - value.length - 1);
      const labels = wrapText(left, labelWidth);
      if (labels.length === 0) labels.push("");
      labels.forEach((label, index) => {
        if (index === labels.length - 1) {
          rows.push(label.padEnd(W - value.length) + value);
        } else {
          rows.push(label);
        }
      });
    },
    /** "Label : nilai" dengan nilai dibungkus sejajar. */
    field(label: string, value: string, labelWidth = 7) {
      const prefix = `${label.padEnd(labelWidth)}: `;
      const lines = wrapText(value || "-", W - prefix.length);
      lines.forEach((line, index) => {
        rows.push(`${index === 0 ? prefix : " ".repeat(prefix.length)}${line}`);
      });
    },
    banner(value: string, char = "=") {
      rows.push(char.repeat(W));
      for (const line of wrapText(value, W)) rows.push(center(line));
      rows.push(char.repeat(W));
    },
    /** Kolom tanda tangan berdampingan (mis. Kasir / Manajer). */
    signatures(labels: string[]) {
      const count = Math.max(1, labels.length);
      const col = Math.floor(W / count);
      rows.push("");
      rows.push(labels.map((label) => cleanText(label).slice(0, col - 1).padEnd(col)).join("").trimEnd());
      rows.push("");
      rows.push("");
      rows.push(labels.map(() => `${"_".repeat(Math.max(4, col - 2))}  `.slice(0, col)).join("").trimEnd());
    },
    output() {
      return rows.join("\r\n") + "\r\n";
    },
  };
}

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatRupiah(value: number | null | undefined): string {
  return currency.format(Math.round(value ?? 0));
}

export function formatSignedRupiah(value: number | null | undefined): string {
  const amount = Math.round(value ?? 0);
  if (amount > 0) return `+${currency.format(amount)}`;
  return currency.format(amount);
}

export function formatJakartaDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

// ── QR di struk (owner, Okt 2026) ───────────────────────────────────────────
// Baris penanda "[[QR:<url>]]" di teks struk. Jalur cetak yang bisa menggambar
// (dialog Chrome, ESC/POS langsung) menggantinya dengan QR; jalur teks (agen,
// route server) membuang baris ini — link teks di bawahnya tetap tercetak.
const RECEIPT_QR_LINE = /^\s*\[\[QR:(\S+)\]\]\s*$/;

export function receiptQrMarker(url: string) {
  return `[[QR:${url.trim()}]]`;
}

/** URL dari baris penanda QR, atau null bila baris biasa. */
export function parseReceiptQrLine(line: string): string | null {
  return RECEIPT_QR_LINE.exec(line)?.[1] ?? null;
}

/** Buang baris penanda QR (untuk printer yang hanya menerima teks). */
export function stripReceiptQr(text: string) {
  return text.replace(/^[ \t]*\[\[QR:\S+\]\][ \t]*(?:\r?\n|$)/gm, "");
}

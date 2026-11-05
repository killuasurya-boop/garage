// Status printer untuk panel QC Kasir (GOD++ Fase 4/6): hasil cetak TERAKHIR di perangkat ini.
// Bukan tebakan koneksi: diisi oleh deliverPrintContent setiap kali mencetak (struk, chit, slip).
// Cetak gagal TIDAK mempengaruhi status pembayaran — hanya ditampilkan agar kasir cetak ulang.

export type PrintHealth = { at: number; ok: boolean; message: string } | null;

let last: PrintHealth = null;
const listeners = new Set<() => void>();

export function recordPrintResult(ok: boolean, message: string, at = Date.now()) {
  last = { at, ok, message: message.slice(0, 200) };
  listeners.forEach((fn) => fn());
}

export function getPrintHealth(): PrintHealth {
  return last;
}

export function getPrintHealthServer(): PrintHealth {
  return null;
}

export function subscribePrintHealth(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

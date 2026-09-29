// Cetak chit di printer stasiun (Bar / Dapur) dari tablet Android.
//
// Printer thermal 58mm seperti Rongta RPP02N memakai Bluetooth klasik (SPP),
// yang TIDAK bisa dijangkau langsung dari halaman web Chrome. Jalurnya: halaman
// membentuk byte ESC/POS lalu membukanya lewat tautan `rawbt:` — aplikasi RawBT
// (gratis, Play Store) di tablet meneruskan ke printer yang sudah dipairing.
//
// Chrome hanya mengizinkan membuka aplikasi lain setelah ketukan pengguna, jadi
// cetak dilakukan lewat satu tombol "Cetak" (semua tiket baru sekaligus) —
// bukan diam-diam tanpa sentuhan.

import type { ProductionTicketView } from "@/lib/garage-api-types";
import { buildKitchenChitContent, type KitchenChitItem } from "@/lib/thermal-receipt";

export type RawbtMode = "base64" | "intent";

export const RAWBT_PACKAGE = "ru.a402d.rawbtprinter";

/** Label station di kertas: "Food" (nama internal) tampil sebagai "Dapur". */
export function chitStationLabel(station: string): "Dapur" | "Bar" {
  return station === "Bar" ? "Bar" : "Dapur";
}

/** Teks chit satu tiket produksi (tanpa harga), format sama dengan chit kasir. */
export function ticketChitContent(ticket: ProductionTicketView): string {
  const station = chitStationLabel(ticket.station);
  const items: KitchenChitItem[] = ticket.items.map((item) => ({
    name: item.label,
    variant: null,
    qty: item.qty,
    note: item.note,
    station,
  }));
  return buildKitchenChitContent({
    orderNo: ticket.orderNo ?? ticket.ticketNo,
    queueNo: ticket.queueNo,
    tableLabel: ticket.table,
    orderType: ticket.channel,
    createdAt: ticket.createdAt,
    cashierName: ticket.identity && ticket.identity !== ticket.table ? ticket.identity : null,
    items,
  });
}

/** Teks -> byte ESC/POS: reset printer + isi (latin1) + umpan kertas. */
export function toEscPosBytes(content: string, feedLines = 4): Uint8Array {
  const body: number[] = [];
  for (const ch of content) {
    const code = ch.codePointAt(0) ?? 63;
    body.push(code <= 0xff ? code : 63); // di luar latin1 -> "?"
  }
  return Uint8Array.from([0x1b, 0x40, ...body, ...Array(feedLines).fill(0x0a)]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Alamat yang dibuka browser untuk menyerahkan byte ke aplikasi RawBT. */
export function rawbtUrl(bytes: Uint8Array, mode: RawbtMode = "base64"): string {
  const b64 = toBase64(bytes);
  return mode === "intent"
    ? `intent:base64,${b64}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};end;`
    : `rawbt:base64,${b64}`;
}

/** Gabungkan beberapa chit jadi satu kiriman (satu ketukan = semua tiket baru). */
export function combineChits(contents: string[]): string {
  return contents.filter((c) => c.trim()).join("\r\n");
}

/** Chit uji untuk mengecek pairing printer & jalur RawBT di tablet. */
export function testChitContent(stationLabel: string): string {
  return buildKitchenChitContent({
    orderNo: "TES-CETAK",
    tableLabel: "TES",
    orderType: "dine-in",
    createdAt: new Date().toISOString(),
    cashierName: "Garage OS",
    items: [
      { name: `Tes printer ${stationLabel}`, variant: null, qty: 1, note: "Jika terbaca, printer siap", station: stationLabel },
    ],
  });
}

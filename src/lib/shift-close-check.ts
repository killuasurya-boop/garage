// =============================================================================
// Panel cek tutup shift (Smart Notification V2, Tahap 1.7) — aturan murni.
// Satu tempat yang menunjukkan pengecualian sebelum laci dihitung: transaksi
// belum lunas, pesanan QR menunggu, meja aktif, kas keluar/masuk menunggu
// persetujuan, koreksi metode/pembatalan lunas di shift ini, dan total non-tunai
// yang harus dicocokkan manual dengan aplikasi bank.
// Hanya menampilkan — tidak pernah memindah uang dan tidak memblokir penutupan
// (aturan tutup shift tetap di closeCashSession).
// Blind count: kas tunai / kas seharusnya TIDAK PERNAH masuk ke item bila
// `canSeeCash` false (Kasir dengan shift terbuka).
// Kas kecil (petty) adalah dana terpisah: tidak dihitung di laci maupun omzet.
// =============================================================================

export type ShiftCloseCheckData = {
  unpaidThisShift: { count: number; total: number; orderNos: string[] };
  unpaidOlder: { count: number; total: number };
  pendingCashMovements: { count: number; amount: number };
  methodCorrections: number;
  paymentReverts: number;
  /** Penjualan lunas per metode NON-tunai di shift ini. */
  nonCash: Array<{ method: string; count: number; total: number }>;
  /** Hanya terisi bila peminta boleh melihat kas (bukan Kasir dengan shift terbuka). */
  cash: { count: number; total: number; expectedCash: number } | null;
};

export type ShiftCloseCheckItem = {
  key: string;
  level: "warn" | "info" | "ok";
  title: string;
  detail: string;
};

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export function isCashMethod(method: string) {
  return /^(cash|tunai)$/i.test(method.trim());
}

export function shiftCloseCheckItems(
  data: ShiftCloseCheckData,
  live: { activeTables: number; pendingQr: number },
) {
  const items: ShiftCloseCheckItem[] = [];
  const warn = (key: string, title: string, detail: string) => items.push({ key, level: "warn", title, detail });

  if (data.unpaidThisShift.count > 0) {
    const sample = data.unpaidThisShift.orderNos.slice(0, 3).join(", ");
    warn(
      "unpaid",
      `${data.unpaidThisShift.count} transaksi belum lunas (${rupiah(data.unpaidThisShift.total)})`,
      `Selesaikan Final Bayar atau serahkan ke shift berikut dengan catatan.${sample ? ` Contoh: ${sample}.` : ""}`,
    );
  }
  if (data.unpaidOlder.count > 0) {
    warn(
      "unpaid_older",
      `${data.unpaidOlder.count} tagihan dari shift sebelumnya masih terbuka`,
      `Total ${rupiah(data.unpaidOlder.total)} — tidak dihitung sebagai penjualan shift ini.`,
    );
  }
  if (live.pendingQr > 0) warn("qr", `${live.pendingQr} pesanan QR menunggu kasir`, "Terima atau tolak sebelum tutup shift.");
  if (live.activeTables > 0) warn("tables", `${live.activeTables} meja masih aktif`, "Pastikan tagihan meja sudah ditangani.");
  if (data.pendingCashMovements.count > 0) {
    warn(
      "cash_movement",
      `${data.pendingCashMovements.count} kas keluar/masuk menunggu persetujuan`,
      "Uangnya belum dicatat pindah — jangan dihitung sebagai keluar dari laci.",
    );
  }
  if (data.methodCorrections > 0 || data.paymentReverts > 0) {
    items.push({
      key: "corrections",
      level: "info",
      title: `${data.methodCorrections} koreksi metode · ${data.paymentReverts} lunas dibatalkan`,
      detail: "Tercatat di buku kas dan audit; ditinjau Manajer saat verifikasi.",
    });
  }
  for (const row of data.nonCash) {
    items.push({
      key: `noncash:${row.method}`,
      level: "info",
      title: `${row.method}: ${rupiah(row.total)} (${row.count} transaksi)`,
      detail: "Cocokkan manual dengan aplikasi/notifikasi bank — tidak ada verifikasi otomatis.",
    });
  }
  if (data.cash) {
    items.push({
      key: "cash",
      level: "info",
      title: `Tunai: ${rupiah(data.cash.total)} (${data.cash.count} transaksi) · kas seharusnya ${rupiah(data.cash.expectedCash)}`,
      detail: "Hanya terlihat Owner/Manajer selama shift terbuka.",
    });
  }
  items.push({
    key: "petty",
    level: "info",
    title: "Kas kecil terpisah",
    detail: "Kas kecil tidak dihitung di laci dan bukan omzet.",
  });

  const warnCount = items.filter((item) => item.level === "warn").length;
  return { items, warnCount, ready: warnCount === 0 };
}

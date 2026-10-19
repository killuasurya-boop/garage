import type { RoleGuide } from "@/lib/role-guides/types";

/** Panduan Manajer/Owner untuk mengawasi kasir & shift. */
export const manajerKasirGuide: RoleGuide = {
  id: "manajer-kasir",
  title: "Panduan Supervisi Kasir (Manajer & Owner)",
  summary: "Persetujuan di kasir, rekap harian, selisih kas, QRIS, dan laporan penjualan.",
  roles: ["Manajer", "Owner"],
  updatedAt: "2026-10-19",
  sections: [
    {
      id: "pin",
      title: "1. Persetujuan dengan PIN di tablet kasir",
      intro: "PIN Manajer/Owner dipakai di tablet kasir. PIN tidak boleh diberikan ke kasir.",
      steps: [
        { text: "PIN di kasir hanya untuk diskon manual, void, refund, dan selisih kas. Pengeluaran besar & stok opname diputus dari menu Persetujuan." },
        {
          text: "Hapus invoice BELUM lunas: di POS buka Pesanan Pelanggan atau detail meja → Hapus invoice → isi alasan → ketik nomor invoice → Ya, hapus. Pesanan Bar/Dapur ikut batal, stok kembali, tercatat di Audit Log.",
          warn: "Invoice LUNAS tidak bisa dihapus. Gunakan Batal (void) / Refund dari Riwayat Struk Shift dengan alasan — riwayat tetap ada untuk laporan penjualan & keuangan.",
        },
        { text: "Diskon manual: cek alasan & nominal, lalu masukkan PIN. Persetujuan hanya berlaku untuk nominal itu." },
        { text: "Void / refund: pastikan pelanggan benar-benar dikembalikan uangnya. Uang tunai otomatis dikurangkan dari laci shift asal." },
        { text: "Kas keluar/masuk kasir mulai batas nominal (default Rp50.000) butuh PIN Anda." },
        { text: "Koreksi metode bayar & cetak ulang struk ke-4 dst. juga lewat Anda." },
      ],
      faq: [
        { q: "PIN salah berkali-kali?", a: "5 kali salah mengunci PIN di tablet itu selama 15 menit." },
      ],
    },
    {
      id: "rekap",
      title: "2. Rekap Harian & selisih kas",
      steps: [
        { text: "Buka Riwayat & Laporan Shift → tab Rekap Harian, pilih tanggal." },
        { text: "Periksa tiap shift: omzet, tunai, non-tunai, kas seharusnya, dihitung, selisih." },
        { text: "Selisih: tanyakan ke kasir, lalu tekan Approve Selisih bila sudah jelas." },
        { text: "Cocokkan QRIS: masukkan total mutasi BNI per shift. Selisih QRIS dicatat terpisah dari laci." },
        { text: "Shift yang lupa ditutup muncul di atas. Hitung uangnya, lalu tutup shift dari sini." },
        { text: "Cetak slip per shift atau Cetak rekap ke printer struk untuk arsip." },
      ],
    },
    {
      id: "laporan",
      title: "3. Laporan penjualan",
      steps: [
        { text: "Tab Laporan Penjualan: pilih Hari ini, Kemarin, 7 hari, Bulan ini, atau tanggal sendiri." },
        { text: "Lihat produk terlaris, kategori, metode bayar, jam ramai, per kasir, dan tipe order." },
        { text: "Unduh CSV untuk Excel, atau Cetak ringkasan ke printer struk." },
      ],
    },
    {
      id: "pengaturan",
      title: "4. Pengaturan yang mempengaruhi kasir",
      steps: [
        { text: "Pengaturan → Shift & Cash: batas PIN kas keluar/masuk, wajib tanda tangan saat selisih." },
        { text: "Pengaturan → Receipt: kolom tanda tangan slip manajemen & jumlah cetak slip." },
        { text: "Pengaturan → Printer: Printer Perangkat Ini (per laptop)." },
        { text: "Pajak & service saat ini 0% (Garage tidak memungut PB1/service)." },
        { text: "Pakai poin member di kasir wajib scan QR kartu/aplikasi member (nomor HP saja ditolak sistem)." },
      ],
    },
  ],
};

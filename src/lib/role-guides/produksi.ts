import type { RoleGuide } from "@/lib/role-guides/types";

// Barista (Bar) & Koki (Dapur) memakai layar Production Hub yang sama; bedanya
// station, nama filter, dan target waktu. Satu sumber supaya isinya selalu sama.
function productionGuide(station: "bar" | "dapur"): RoleGuide {
  const isBar = station === "bar";
  const label = isBar ? "BAR" : "DAPUR";
  const what = isBar ? "minuman" : "makanan";
  return {
    id: isBar ? "barista" : "dapur",
    title: isBar ? "Panduan Barista (Bar)" : "Panduan Dapur (Koki)",
    summary: `Membuat ${what} dari antrean Production Hub, QC, memanggil waiter, mengatur stok habis, dan stok bahan.`,
    roles: ["Kasir"],
    workstations: isBar ? ["bar", "all", "helper_bar", "helper_all"] : ["dapur", "all", "helper_dapur", "helper_all"],
    updatedAt: "2026-10-12",
    sections: [
      {
        id: "mulai",
        title: "1. Mulai kerja",
        steps: [
          { text: `Login dengan akun Anda. Layar pertama adalah Production (Bar & Dapur) dengan filter ${label} sudah terpilih.` },
          { text: "Absen masuk di menu Absensi (PIN, selfie, GPS)." },
          { text: "Nyalakan Suara ON. Pakai Layar LCD untuk tampilan besar di tablet/TV station." },
          {
            text: `Printer ${isBar ? "BAR" : "Dapur"}: ON → tiket baru tercetak otomatis. Pengaturan → Tes cetak bila printer baru dinyalakan.`,
          },
          { text: "Akun produksi tidak memegang uang dan tidak membuka POS kasir." },
        ],
      },
      {
        id: "antrean",
        title: "2. Membuat pesanan",
        intro: "Kolom: Menunggu → Diproses → Siap. Kartu menunjukkan nama tamu, meja, item + catatan, dan waktu berjalan vs target.",
        steps: [
          { text: "Ambil tiket paling lama dulu (paling atas). Tekan Mulai." },
          {
            text: "Smart Batch: beberapa pesanan dengan menu & catatan sama bisa dibuat sekaligus — tekan Mulai batch ×N.",
            tip: "Batch: setelah selesai, tekan QC + Allocation lalu ketuk tiap porsi (Nama + Meja) sampai UNALLOCATED = 0, lalu Batch complete.",
          },
          { text: "Selesai: tekan QC · Siap · Panggil → cek tampilan & catatan → QC OK · Siap · Panggil. Waiter otomatis dipanggil." },
          {
            text: "Timer merah = lewat target waktu. Kerjakan segera dan beri tahu kasir bila ada kendala.",
          },
          {
            text: "Kartu bertuliskan Sebagian batal = sebagian porsi dibatalkan/direfund kasir. Buat hanya porsi yang tersisa di kartu.",
            warn: "Pesanan di bagian merah Batal jangan dibuat lagi.",
          },
        ],
      },
      {
        id: "serah",
        title: "3. Serah ke waiter",
        steps: [
          { text: "Kolom Siap menunjukkan Waiter dipanggil + timer. Lewat 3 menit belum diambil → muncul Belum diambil & pengingat suara." },
          { text: "Saat waiter mengambil, tekan namanya di Diambil oleh. Pesanan tercatat diantar." },
          { text: "Pesanan delivery diambil kurir lewat kasir — tiket tertutup otomatis saat kurir menekan Ambil pesanan." },
          { text: "Salah tandai Siap? Tekan Kembalikan ke proses dan tulis alasannya (sebelum waiter mengambil)." },
        ],
      },
      {
        id: "habis",
        title: "4. Menu habis",
        steps: [
          { text: `Bahan habis: tekan Stok Habis di atas layar, ketuk menu ${what} yang tidak bisa dibuat → HABIS.` },
          { text: "Menu HABIS terkunci di POS kasir & menu digital QR. Ketuk lagi untuk Tersedia saat bahan sudah ada." },
          { text: "Hanya menu station Anda yang bisa diatur." },
        ],
      },
      {
        id: "stok",
        title: "5. Stok bahan (Gudang)",
        intro: "Stok bahan dicatat di menu Warehouse. Akun Bar/Dapur melihat ruang Outlet Bar / Outlet Dapur.",
        steps: [
          { text: "Cek bahan menipis di Warehouse → Dashboard / Inventory." },
          { text: "Butuh bahan dari gudang utama: Internal Order → pilih bahan & jumlah. Stok langsung pindah ke ruang outlet." },
          { text: "Stock Opname: buka sesi untuk ruang outlet, isi hitungan fisik tiap bahan yang dihitung, lalu minta Manajer menekan Finalisasi." },
          {
            text: "Bahan yang tidak Anda hitung tidak diubah saat finalisasi — hitung semua bahan yang memang dicek.",
            warn: "Stok bahan gudang tidak bisa diubah langsung dari modul Inventory. Penerimaan barang, transfer, dan penyesuaian dilakukan Manajer/Owner.",
          },
          { text: "Jalankan Checklist / Cold Chain sesuai jadwal shift." },
        ],
      },
      {
        id: "selesai",
        title: "6. Selesai kerja",
        steps: [
          { text: "Pastikan kolom Menunggu & Diproses kosong atau sudah diserahkan ke shift berikutnya." },
          { text: "Bersihkan station, lalu absen pulang di menu Absensi dan logout." },
        ],
      },
    ],
  };
}

export const baristaGuide = productionGuide("bar");
export const dapurGuide = productionGuide("dapur");

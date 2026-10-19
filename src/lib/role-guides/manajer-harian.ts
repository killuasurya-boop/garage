import type { RoleGuide } from "@/lib/role-guides/types";

/** Panduan kerja harian Manajer (di luar supervisi kasir — lihat manajer-kasir). */
export const manajerHarianGuide: RoleGuide = {
  id: "manajer-harian",
  title: "Panduan Harian Manajer",
  summary: "Persetujuan, gudang (penerimaan, transfer, opname), keuangan harian, absensi & gajian, tim, dan pengaturan.",
  roles: ["Manajer", "Owner"],
  updatedAt: "2026-10-13",
  sections: [
    {
      id: "pagi",
      title: "1. Buka hari",
      steps: [
        { text: "Buka Dashboard / Control Center: antrean produksi, meja, stok menipis, dan peringatan." },
        { text: "Absensi → Absen Hari Ini: cek siapa yang sudah masuk / terlambat." },
        { text: "Pastikan shift kasir dibuka dengan modal yang benar." },
      ],
    },
    {
      id: "approval",
      title: "2. Persetujuan",
      steps: [
        { text: "Menu Persetujuan: diskon, void, refund, selisih kas, pengeluaran, dan opname. Tolak wajib dengan alasan." },
        {
          text: "Pengajuan yang Anda buat sendiri (pengeluaran, kasbon, opname) harus disetujui orang lain — sistem menolak persetujuan sendiri.",
        },
        { text: "Pengeluaran di atas batas Owner: persetujuan Anda menjadi Direview — menunggu Owner." },
        {
          text: "Void/refund: bahan menu yang belum dibuat kembali ke stok; menu yang sudah dibuat/diantar dicatat waste (tercatat di Audit sebagai wasteItems).",
        },
      ],
    },
    {
      id: "gudang",
      title: "3. Gudang (Warehouse)",
      steps: [
        {
          text: "Penerimaan barang: Receiving → buat draft (supplier, tanggal terima, metode bayar, qty, harga, QC) → Selesai. Stok bertambah, HPP diperbarui, belanja tercatat lunas.",
          warn: "Harga beli wajib benar — HPP semua menu ikut berubah. Salah input? Batalkan penerimaan dari Receiving.",
        },
        { text: "Transfer antar ruang, Production (olah bahan), dan Adjustment (wajib alasan) hanya oleh Manajer/Owner." },
        { text: "Stock Opname dari staf: periksa hitungan, lalu Finalisasi & Reconcile Stok. Bahan yang tidak dihitung tidak diubah." },
        { text: "Smart Reorder untuk draft pesanan pembelian bahan yang menipis." },
      ],
    },
    {
      id: "keuangan",
      title: "4. Keuangan harian",
      steps: [
        { text: "Catat pengeluaran (Finance → Pengeluaran) dengan kategori & bukti." },
        { text: "Riwayat & Laporan Shift → Rekap Harian: cocokkan QRIS, setujui selisih kas, tutup shift yang lupa ditutup." },
        { text: "Laporan Penjualan untuk omzet, produk terlaris, dan metode bayar." },
        { text: "Closing Keuangan harian di akhir hari (membuka ulang closing hanya Owner)." },
      ],
    },
    {
      id: "payroll",
      title: "5. Absensi & gajian",
      steps: [
        { text: "Koreksi absen karyawan dengan alasan. Absen Anda sendiri hanya bisa dikoreksi Owner." },
        { text: "Gaji & fee harian difinalisasi otomatis pukul 23:59 — tidak bisa difinalisasi sebelum hari selesai." },
        { text: "Gajian & Kasbon: bayar per karyawan sampai tanggal tertentu. Sistem mencegah pembayaran ganda." },
        { text: "Rekap & Slip untuk dicetak / dibagikan." },
      ],
    },
    {
      id: "tim",
      title: "6. Tim & pengaturan",
      steps: [
        { text: "Manajemen Tim: buat, ubah, nonaktifkan, atau reset password akun Kasir/Waiter. Atur posisi (workstation): Bar, Dapur, Helper, atau Kurir." },
        { text: "Reset PIN absen bila karyawan lupa." },
        { text: "Profil karyawan (klik nama di Direktori): data diri, absensi bulan ini, saldo gaji/fee, kasbon, dokumen, dan aktivitas. NIK & rekening tampil tersamar — hanya Owner yang bisa mengubahnya." },
        { text: "Profil member (CRM → klik member): foto (klik avatar untuk mengganti), alamat, riwayat poin dapat/pakai/kedaluwarsa dengan saldo, order, dan voucher." },
        { text: "Pengaturan: Meja & QR, printer, struk, batas PIN kas keluar/masuk." },
        { text: "CRM/Membership: koreksi poin wajib dengan alasan. Audit untuk memeriksa aksi sensitif." },
      ],
    },
    {
      id: "undangan",
      title: "7. Undangan Grand Opening",
      intro: "Menu Undangan Digital: tamu, link undangan pribadi, dan rekap RSVP.",
      steps: [
        { text: "Tambah tamu satu per satu, atau tab Impor → unduh template → isi Nama, WhatsApp, Jumlah orang → Pratinjau → Simpan. Baris duplikat/tidak valid tidak ikut disimpan." },
        { text: "Tekan Buat undangan untuk membuat link pribadi semua tamu yang belum punya." },
        {
          text: "Bagikan manual: WhatsApp terbuka dengan pesan siap kirim. Kirim pesannya, lalu tekan Sudah dikirim — tandai dibagikan.",
          warn: "Status Dibagikan hanya catatan petugas, bukan bukti pesan terkirim/terbaca. Jangan tandai sebelum benar-benar mengirim.",
        },
        { text: "Link tersebar ke orang lain? Tekan Link baru (link lama mati, jawaban RSVP tetap). Cabut = link tidak bisa dipakai sama sekali." },
        { text: "Pantau rekap: Hadir (undangan & total orang), Tidak hadir, Belum menjawab. Ekspor CSV hanya untuk Owner." },
        {
          text: "H-1 (Jumat 23 Okt): untuk tamu berstatus Hadir tekan Ingatkan H-1 — WhatsApp terbuka dengan pesan pengingat + link undangan. Kirim manual.",
          warn: "Tombol Ingatkan H-1 hanya muncul untuk tamu yang sudah konfirmasi Hadir. Pengingat tidak mengubah status Dibagikan.",
        },
      ],
    },
  ],
};

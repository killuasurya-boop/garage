import type { RoleGuide } from "@/lib/role-guides/types";

/** Panduan Waiter / Pelayan: meja, panggilan, pesanan, antar, bersih. */
export const waiterGuide: RoleGuide = {
  id: "waiter",
  title: "Panduan Waiter (Pelayan)",
  summary: "Melayani meja dari tamu datang, pesan, antar pesanan, sampai meja bersih kembali. Waiter tidak memegang uang.",
  roles: ["Waiter"],
  // Akun kurir juga role Waiter (workstation "kurir") — punya panduan sendiri.
  onlyWithoutWorkstation: true,
  updatedAt: "2026-10-13",
  sections: [
    {
      id: "mulai",
      title: "1. Mulai kerja",
      steps: [
        { text: "Login dengan akun Anda sendiri. Layar pertama adalah Waiter (peta meja)." },
        { text: "Absen masuk di menu Absensi: PIN, foto selfie, dan lokasi (GPS) harus aktif." },
        {
          text: "Aktifkan suara & getar (ikon pengaturan di HP) supaya panggilan meja dan pesanan siap antar terdengar.",
          tip: "Izinkan notifikasi browser agar panggilan tetap masuk walau HP terkunci.",
        },
      ],
    },
    {
      id: "peta",
      title: "2. Membaca peta meja",
      intro: "Warna meja sama di semua layar (menu digital, waiter, kasir).",
      steps: [
        { text: "Hijau = Kosong · Kuning = Sedang dipilih tamu · Merah = Terisi (Belum bayar / Di kasir / Lunas) · Biru = Reserved · Abu-abu = Perlu dibersihkan." },
        { text: "Pakai filter: Semua, Belum bayar, Sebagian lunas, Lunas, Perlu bersih, Kosong." },
        { text: "Tab Tagihan menampilkan daftar bill per meja." },
        { text: "Ketuk meja untuk membuka detail: rincian pesanan, status Dapur/Bar (Antre, Diproses, Siap antar, Diantar), dan tombol aksi." },
      ],
    },
    {
      id: "panggilan",
      title: "3. Panggilan meja",
      steps: [
        { text: "Panel merah Panggilan meja berisi: Panggil Pelayan, Minta Bill, Air / Tisu, Minta Pindah Meja, Bantuan." },
        { text: "Datangi meja, layani, lalu tekan Selesai pada kartu panggilan." },
      ],
    },
    {
      id: "pesan",
      title: "4. Memesankan untuk tamu",
      steps: [
        { text: "Tekan Pesankan, pilih meja (dari peta atau ketik nomornya). Menu digital terbuka dalam mode waiter." },
        { text: "Pilih menu & varian, isi nama tamu dan catatan bila perlu, lalu kirim." },
        {
          text: "Pesanan masuk ke kasir dulu. Setelah kasir menerima, pesanan diteruskan ke Bar/Dapur.",
          warn: "Promo khusus pemesanan QR mandiri tidak berlaku untuk pesanan yang dibuat waiter.",
        },
        { text: "Tamu meja terisi yang ingin bergabung memakai kode gabung 4 angka dari struk." },
      ],
    },
    {
      id: "antar",
      title: "5. Mengantar pesanan",
      steps: [
        { text: "Saat Bar/Dapur menekan Panggil waiter, HP Anda berbunyi dengan nomor meja." },
        { text: "Ambil pesanan di station. Petugas station menekan nama Anda di Diambil oleh — pesanan tercatat diantar oleh Anda." },
        { text: "Antar ke meja yang benar. Cek nama tamu & nomor meja di tiket." },
      ],
    },
    {
      id: "tagihan",
      title: "6. Tagihan & pembayaran",
      steps: [
        { text: "Tamu minta bill: buka detail meja → Minta tagihan. Status menjadi Tagihan di kasir." },
        { text: "Pembayaran selalu di kasir. Waiter tidak menerima uang, tidak membatalkan, dan tidak memberi diskon." },
        {
          text: "Kirim invoice ke WA tamu: buka detail meja → di bawah pesanan tekan Kirim invoice WA → isi nomor WA tamu → Buka WhatsApp → kirim.",
          tip: "Nomor yang diisi tersimpan di pesanan, jadi kasir tidak perlu bertanya lagi.",
        },
      ],
    },
    {
      id: "meja",
      title: "7. Pindah, tamu pergi & bersih",
      steps: [
        { text: "Pindah meja: detail meja → Pindah meja → pilih meja kosong → Ya, pindahkan. Semua bill & pesanan ikut pindah." },
        { text: "Setelah tamu pergi: Tamu pergi → Mulai bersihkan → Sudah bersih. Meja kembali hijau (Kosong)." },
        {
          text: "Meja tidak bisa ditandai bersih selama masih ada bill yang belum lunas atau pesanan yang belum diantar.",
          warn: "Jika ada tamu baru di meja yang belum dibersihkan, selesaikan bill-nya dulu di kasir.",
        },
        { text: "Reservasi: Tandai dipesan / Batal reservasi. Meja yang sedang dipilih tamu bisa dilepas dengan Lepas kunci." },
      ],
    },
    {
      id: "selesai",
      title: "8. Selesai kerja",
      steps: [
        { text: "Pastikan tidak ada panggilan meja yang tertinggal dan meja yang perlu dibersihkan." },
        { text: "Absen pulang di menu Absensi, lalu logout." },
      ],
    },
  ],
};

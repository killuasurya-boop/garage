import type { RoleGuide } from "@/lib/role-guides/types";

/** Panduan lengkap Kasir: login → buka shift → transaksi → tutup shift. */
export const kasirGuide: RoleGuide = {
  id: "kasir",
  title: "Panduan Kasir & Shift",
  summary:
    "Alur kerja kasir Garage dari login, buka shift, melayani pesanan, sampai tutup shift dan balancing uang laci.",
  roles: ["Kasir"],
  // Barista / koki juga role Kasir (workstation bar/dapur) — mereka pakai panduan produksi.
  onlyWithoutWorkstation: true,
  updatedAt: "2026-10-13",
  sections: [
    {
      id: "login",
      title: "1. Login & layar kunci",
      intro: "Setiap kasir memakai akun sendiri. Semua transaksi tercatat atas nama akun yang login.",
      steps: [
        { text: "Buka aplikasi Garage OS di Google Chrome, masukkan email dan password akun Anda, lalu tekan Masuk." },
        {
          text: "Login pertama kali: sistem meminta Ganti Password. Buat password baru minimal 8 karakter dan jangan dibagikan.",
          warn: "Selama password belum diganti, semua menu kasir terkunci.",
        },
        { text: "Setelah login Anda langsung masuk ke layar POS (Kasir)." },
        {
          text: "Saat meninggalkan meja kasir, tekan Kunci (ikon gembok) di pengaturan kasir. Layar juga terkunci otomatis bila lama tidak disentuh.",
          tip: "Buka kunci dengan password akun Anda sendiri. Layar tetap terkunci walau halaman di-refresh.",
        },
      ],
      faq: [
        { q: "Lupa password?", a: "Minta Owner/Manajer mereset password dari menu Tim. Anda akan diminta membuat password baru saat login." },
        { q: "Salah password berkali-kali saat buka kunci?", a: "Setelah 5 kali salah, buka kunci diblokir 15 menit. Tunggu atau minta bantuan Manajer." },
      ],
    },
    {
      id: "buka-shift",
      title: "2. Buka shift (modal awal)",
      intro: "Transaksi hanya bisa dilakukan setelah shift dibuka. Satu kasir = satu shift terbuka.",
      steps: [
        { text: "Di layar POS tekan Buka Shift." },
        {
          text: "Hitung uang di laci, lalu isi Modal Awal (Rp50.000–Rp500.000, kelipatan Rp50.000).",
          tip: "Sistem menampilkan sisa uang laci yang ditinggal shift sebelumnya. Pastikan jumlah fisiknya sama.",
        },
        { text: "Pilih Shift 1 atau Shift 2. Shift ke-3 dan seterusnya dalam satu hari butuh PIN Manajer/Owner." },
        {
          text: "Bila shift kemarin belum ditutup, POS menampilkan layar \"Shift belum ditutup\". Tutup shift lama dulu, baru buka shift baru.",
          warn: "Shift yang terbuka lebih dari 20 jam tidak bisa dipakai transaksi.",
        },
      ],
    },
    {
      id: "printer",
      title: "3. Printer struk (laptop)",
      steps: [
        { text: "Buka POS → ikon pengaturan kasir → tab Printer → bagian \"Printer Perangkat Ini\"." },
        {
          text: "RPP02N via Bluetooth: pair dulu di Windows (PIN 0000/1234). Lalu pilih Kabel/Bluetooth (COM) → Hubungkan → pilih port \"Standard Serial over Bluetooth\".",
        },
        { text: "Pilih lebar kertas 58 mm (RPP02N) atau 80 mm, lalu tekan Tes cetak." },
        { text: "Printer lain yang sudah terpasang di Windows: pilih Printer umum (Chrome)." },
      ],
      faq: [
        { q: "Huruf acak saat cetak?", a: "Ganti kecepatan port (baud) ke 115200 lalu tes lagi." },
        { q: "Printer terputus?", a: "Nyalakan printer, lalu tekan Hubungkan lagi di tab Printer." },
      ],
    },
    {
      id: "order",
      title: "4. Membuat pesanan",
      steps: [
        { text: "Pilih kategori atau cari menu, ketuk menu, lalu pilih varian (mis. Cold / Hot). Item masuk keranjang." },
        { text: "Ubah jumlah dengan tombol + / −. Tambahkan catatan per item bila perlu (mis. less ice)." },
        {
          text: "Pilih jenis pesanan: Dine-in (wajib pilih meja), Take away, atau Delivery.",
          tip: "Warna meja: hijau kosong, kuning sedang dipilih, merah terisi, biru reserved, abu-abu perlu dibersihkan.",
        },
        {
          text: "Delivery: isi nama, WhatsApp, alamat & titik lokasi. Ongkir dihitung otomatis (Rp5.000 untuk 2 km pertama + Rp2.000/km, maks 7 km). Minimal belanja Rp25.000. Delivery wajib dibayar dulu.",
        },
        { text: "Chit Dapur/Bar tercetak otomatis setelah pesanan dibayar (bila diaktifkan Owner)." },
      ],
    },
    {
      id: "member-diskon",
      title: "5. Member, voucher & diskon",
      steps: [
        { text: "Cari member dengan nomor HP, atau daftarkan member baru dari kasir. Nomor wajib WhatsApp aktif (08xx)." },
        {
          text: "Cek WA member: saat member dipilih, tekan Cek WA (WhatsApp terbuka), minta pelanggan membalas, lalu tekan Tandai WA aktif.",
        },
        { text: "Voucher: masukkan kode lalu cek. Voucher pribadi hanya bisa dipakai pemiliknya, dan kuota voucher dibatasi." },
        {
          text: "Poin: tekan Scan QR member, lalu pindai QR di kartu/aplikasi member (kamera atau scanner). Setelah terverifikasi, isi jumlah poin yang dipakai. Potongan muncul di ringkasan bayar.",
          warn: "Poin tidak bisa dipakai hanya dengan nomor HP. QR harus milik member yang dipilih.",
        },
        {
          text: "Diskon manual hanya untuk member. Di atas batas yang ditentukan Owner, tekan Minta Persetujuan lalu Manajer/Owner memasukkan PIN di tablet kasir.",
          warn: "Persetujuan diskon hanya berlaku untuk nominal yang disetujui dan untuk kasir yang meminta.",
        },
      ],
    },
    {
      id: "qr-order",
      title: "6. Pesanan QR dari pelanggan",
      steps: [
        { text: "Pesanan dari QR meja / menu digital muncul di daftar QR order dengan bunyi notifikasi." },
        { text: "Periksa isi pesanan lalu tekan Terima. Pesanan Take away & Delivery harus Lunas dulu sebelum diterima." },
        { text: "Tolak bila menu habis atau pesanan tidak jelas. Stok dan poin pelanggan dikembalikan otomatis." },
        {
          text: "Pesanan Transfer/QRIS dengan label Bukti transfer ✓ sudah diunggah pelanggan. Tekan Lihat, cocokkan nominal dengan mutasi rekening/QRIS, baru proses Lunas.",
          warn: "Bukti foto bisa dipalsukan — tetap cek uang benar-benar masuk di aplikasi bank.",
        },
        {
          text: "Pelanggan yang bergabung di meja terisi memakai kode gabung 4 angka yang tercetak di struk.",
        },
      ],
    },
    {
      id: "bayar",
      title: "7. Pembayaran",
      steps: [
        { text: "Tekan Bayar, pilih metode: Tunai, QRIS, Transfer, atau E-Wallet." },
        {
          text: "Tunai: masukkan uang yang diterima. Sistem menghitung kembalian dan menolak bila uang kurang.",
          tip: "Hitung kembalian di depan pelanggan sebelum laci ditutup.",
        },
        { text: "QRIS: tunjukkan QR resmi Garage, tunggu notifikasi berhasil di aplikasi bank, baru tekan Lunas." },
        { text: "Split bayar: satu tagihan dibayar dengan beberapa metode (mis. sebagian tunai, sisanya QRIS)." },
        { text: "Split bill: satu meja dipisah jadi beberapa tagihan per orang." },
        { text: "Bill sementara (belum lunas) bisa dicetak dari detail meja. Struk ini bertanda BILL SEMENTARA." },
        { text: "Setelah lunas: isi nomor WA pelanggan lalu Kirim Invoice ke Customer — WhatsApp terbuka dengan rincian pesanan & link invoice, tinggal tekan kirim." },
      ],
    },
    {
      id: "koreksi",
      title: "8. Cetak ulang, koreksi & pembatalan",
      steps: [
        {
          text: "Cetak ulang struk: menu Riwayat Struk Shift → Cetak ulang. Maksimal 3 kali per order. Setelah itu minta Manajer/Owner.",
        },
        {
          text: "Salah pilih metode bayar (mis. tercatat Tunai padahal QRIS): Koreksi Metode Bayar sebelum tutup shift, dengan PIN Manajer/Owner.",
        },
        {
          text: "Batal (void) / refund: ajukan dari detail order dengan alasan. Manajer/Owner menyetujui dengan PIN. Uang tunai yang dikembalikan otomatis dikurangkan dari laci.",
          warn: "Jangan mengembalikan uang sebelum void/refund disetujui sistem. Menu yang belum dibuat: bahan kembali ke stok. Menu yang sudah dibuat/diantar: dicatat waste.",
        },
      ],
    },
    {
      id: "kas",
      title: "9. Kas keluar / masuk laci",
      intro: "Semua uang yang keluar atau masuk laci di luar penjualan wajib dicatat supaya hitungan tutup shift pas.",
      steps: [
        { text: "Tekan Kas Keluar / Masuk di POS." },
        { text: "Kas keluar: belanja kecil (es batu, gas), kasbon. Pilih kategori, tulis keterangan, isi nominal." },
        { text: "Kas masuk: tambahan uang kecil dari Owner. Pilih Kas masuk lalu isi nominal." },
        {
          text: "Mulai Rp50.000 (atau batas dari Owner) wajib PIN Manajer/Owner.",
          tip: "Slip kas keluar/masuk tercetak otomatis. Simpan bersama nota belanja.",
        },
      ],
    },
    {
      id: "tutup-shift",
      title: "10. Tutup shift & balancing uang",
      intro:
        "Penutupan memakai blind count: kasir menghitung uang tanpa melihat angka sistem. Selisih baru terlihat setelah shift ditutup.",
      steps: [
        { text: "Pastikan semua pesanan sudah dibayar atau diserahkan ke shift berikutnya." },
        { text: "Tekan Tutup Shift, lalu hitung uang laci per pecahan (Rp100.000, Rp50.000, … koin). Total terhitung otomatis." },
        { text: "Isi total QRIS dari aplikasi BNI (mutasi hari ini) untuk dicocokkan." },
        { text: "Pilih uang yang ditinggal di laci untuk shift berikutnya. Sisanya disetor ke Owner." },
        { text: "Centang checklist penutupan, tulis catatan bila ada kejadian." },
        {
          text: "Konfirmasi. Bila selisih besar, sistem meminta PIN Manajer/Owner sebagai saksi.",
          warn: "Jangan menghitung ulang untuk \"mencari\" angka sistem. Hitung jujur, selisih akan diperiksa Manajer.",
        },
        { text: "Setelah ditutup, tekan Cetak slip (printer struk) dan serahkan slip + uang setoran ke Manajer/Owner." },
      ],
    },
    {
      id: "serah-terima",
      title: "11. Serah terima ke shift berikutnya",
      steps: [
        { text: "Kasir berikutnya membuka shift dengan modal awal = uang yang Anda tinggalkan di laci." },
        { text: "Sampaikan pesanan yang masih berjalan, meja terisi, dan catatan penting." },
        { text: "Logout dari akun Anda." },
      ],
    },
    {
      id: "laporan",
      title: "12. Laporan penjualan shift saya",
      steps: [
        { text: "Buka POS → Laporan Shift → \"Penjualan shift saya\" untuk melihat produk terlaris, kategori dan metode bayar shift Anda." },
        { text: "Tekan Cetak ringkasan untuk mencetak ke printer struk, atau CSV untuk diunduh." },
      ],
    },
    {
      id: "masalah",
      title: "13. Masalah umum",
      steps: [
        { text: "Internet putus: pesanan disimpan di antrean offline dan dikirim otomatis saat online kembali." },
        { text: "\"Open shift wajib dilakukan\": buka shift dulu." },
        { text: "\"Shift sudah terbuka lebih dari 20 jam\": tutup shift lama, lalu buka shift baru." },
        { text: "Printer tidak mencetak: cek kertas & daya, lalu tab Printer → Hubungkan → Tes cetak." },
        { text: "Ragu atau ada selisih: hubungi Manajer/Owner. Jangan menutupi selisih dengan uang pribadi." },
      ],
    },
  ],
};

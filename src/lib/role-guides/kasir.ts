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
  updatedAt: "2026-10-19",
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
          text: "Hitung uang di laci, lalu isi Modal Awal sesuai uang yang ada (boleh pecahan, mis. Rp55.200).",
          tip: "Sistem menampilkan sisa uang laci yang ditinggal shift sebelumnya. Pastikan jumlah fisiknya sama.",
        },
        {
          text: "Buka \"Hitung pecahan modal awal\" lalu isi jumlah lembar/keping per pecahan (Rp100.000 … Rp100 koin, koin Rp1.000 terpisah). Totalnya harus sama dengan modal awal — tercatat di laporan pertanggungjawaban.",
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
        {
          text: "Ukuran huruf Besar + Huruf tebal (bawaan) membuat struk hitam pekat dan mudah dibaca. Lewat dialog print Chrome, huruf Besar memakai tata letak 24 kolom (huruf lebih besar) dengan TOTAL & Kembali dicetak tinggi. Pilih Normal bila ingin hemat kertas.",
          tip: "Angka di kanan struk terpotong? Ubah Jumlah kolom per baris ke 30. Kertas tidak keluar sama sekali? Centang Mode kompatibel, lalu Tes cetak lagi.",
        },
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
        {
          text: "Kategori Lainnya: Minuman Botol (Mineral) dan Rokok diserahkan langsung oleh kasir — tidak membuat tiket Bar/Dapur. Rokok tidak tampil di menu digital pelanggan.",
        },
      ],
    },
    {
      id: "member-diskon",
      title: "5. Member, poin & diskon",
      steps: [
        { text: "Cari member dengan nomor HP, atau daftarkan member baru dari kasir. Nomor wajib WhatsApp aktif (08xx)." },
        {
          text: "Cek WA member: saat member dipilih, tekan Cek WA (WhatsApp terbuka), minta pelanggan membalas, lalu tekan Tandai WA aktif.",
        },
        { text: "Voucher dan Promo QR sudah tidak berlaku (Owner 25 Nov 2026). Potongan hanya lewat tukar poin member atau diskon kasir berizin." },
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
          text: "Tunai: ketuk nominal cepat (Uang pas, 5.000, 10.000, 20.000, 50.000, 100.000 — yang cukup untuk total) atau ketik uang yang diterima. Sistem menghitung kembalian dan menolak bila uang kurang.",
          tip: "Setelah lunas, layar selesai menampilkan KEMBALIAN besar — hitung kembalian di depan pelanggan sebelum laci ditutup.",
        },
        {
          text: "Lihat hasil penjualan shift Anda: menu Laporan Shift → kartu Penjualan shift saya (Cash / QRIS / Transfer dan Dine-in kasir / Menu digital / Take away / Delivery). Kas laci tetap dihitung saat tutup shift.",
        },
        {
          text: "Bayar nanti (simpan tagihan): di langkah 4 tekan Bayar nanti. Wajib pilih meja (dine-in) atau isi nama pelanggan (take away). Pesanan langsung masuk Bar/Dapur, tagihan tetap terbuka.",
          tip: "Saat pelanggan selesai, buka Pesanan Pelanggan / detail meja lalu tekan Final Bayar — pilih Cash/QRIS/Transfer, kembalian tampil di sana. Poin & diskon kasir dipakai saat Final Bayar.",
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
        {
          text: "Kasir tidak bisa menghapus atau membatalkan penjualan. Pesanan QR yang belum diterima boleh ditolak; yang sudah diproses Bar/Dapur → tekan Ajukan batal (Manajer/Owner yang menyetujui). Hapus invoice, ubah status/metode bayar, edit, dan arsip hanya Owner/Manajer.",
        },
        {
          text: "Struk mencantumkan STATUS pembayaran (LUNAS / PENDING / GAGAL), metode (Cash/QRIS/Transfer), jumlah dibayar, dan Sisa tagihan bila belum lunas. QRIS tetap PENDING sampai Anda menekan Lunas setelah notifikasi bank masuk.",
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
        { text: "Pilih uang yang ditinggal di laci untuk shift berikutnya. Sisanya disetor ke Rekening Jago/BNI lewat Kas Keluar → Setoran, lalu Owner/Manajer mengonfirmasi bukti setor." },
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
      id: "produksi",
      title: "12. Proses pesanan Bar & Dapur",
      intro: "Kasir ikut mengontrol pesanan masuk: boleh Mulai, READY, dan memanggil waiter di Bar maupun Dapur.",
      steps: [
        { text: "Di POS tekan tombol Bar & Dapur (angka = tiket aktif): semua pesanan aktif tampil urut pesan duluan. Filter Semua / Bar / Dapur, tab Diantar 1 jam untuk yang sudah selesai." },
        {
          text: "Tiap tiket punya baris status: Antri → Dibuat → Siap → Waiter dipanggil → Diambil waiter → Diantar, lengkap dengan jam dan nama petugas. Tulisan besar di kanan atas = status sekarang.",
        },
        { text: "Tombol besar = langkah berikutnya: Mulai buat → Siap & panggil waiter (cek item/jumlah/varian/catatan, lalu Ya, siap) → Panggil ulang waiter bila belum diambil." },
        {
          text: "Tidak perlu waiter (pelanggan ambil di kasir / take away)? Tekan Serahkan langsung — pesanan langsung berstatus Diantar atas nama Anda tanpa menunggu ACC waiter.",
        },
        {
          text: "Tiket Bar/Dapur memuat: antrian, meja, nama, tipe pesanan, jam pesan, target jam siap, TAMBAHAN KE-n untuk pesanan tambahan, catatan per item & catatan order, jumlah item, serta jam cetak + nama Anda.",
        },
        {
          text: "Cetak tiket: cetak chit satu pesanan untuk Bar/Dapur. Cetak semua tiket baru: cetak semua tiket Antri yang belum dicetak di laptop ini sekaligus (boleh lewat dialog print Chrome).",
        },
        { text: "Layar Production penuh tetap bisa dibuka dari tombol di panel yang sama. Owner & Manajer memakai panel yang sama." },
        {
          text: "Salah tandai READY? Buka ulang tiket dengan alasan, selama belum diambil waiter.",
          warn: "Semua tindakan tercatat atas nama akun Anda. Pastikan pesanan benar-benar siap sebelum READY.",
        },
      ],
    },
    {
      id: "cepat",
      title: "13. Kerja cepat kasir",
      intro: "Empat jalan pintas supaya antrean cepat habis.",
      steps: [
        { text: "Favorit: baris ⭐ Favorit di atas menu berisi 8 menu yang paling sering Anda tekan di perangkat ini (awal: menu Bestseller). Tekan sekali = masuk keranjang." },
        { text: "Kode singkat: ketik 2–4 huruf di kolom cari, mis. cl = Coffee Latte, ng = Nasi Goreng. Kode tertulis di pojok kiri atas tiap kartu menu. Tekan Enter untuk langsung memesan menu teratas." },
        {
          text: "Bayar 1 tap: di bawah tombol Bayar ada ⚡ Uang pas (take away, langsung lunas tunai, kembalian 0) dan ⚡ QRIS (take away, langsung ke layar QRIS). Di HP tombol ini ada di Keranjang.",
          warn: "Uang pas hanya bila pelanggan memberi uang tepat sejumlah total. Ada kembalian? Pakai tombol Bayar biasa.",
        },
        { text: "QR di struk: bagian bawah struk pelanggan kini ada QR \"SCAN UNTUK CEK PESANAN\". Pelanggan scan dengan kamera HP untuk melihat status pesanan & invoice — link teks tetap dicetak di bawahnya." },
        { text: "Suara pesanan siap: saat Bar/Dapur menandai pesanan Siap, POS berbunyi dan muncul pesan \"Pesanan siap: #antrian meja\". Suara mengikuti setelan Suara QR (Off = senyap)." },
      ],
    },
    {
      id: "pertanggungjawaban",
      title: "14. Petty cash, catatan kejadian & laporan lengkap",
      intro: "Semua aktivitas uang & kejadian shift masuk ke satu PDF pertanggungjawaban.",
      steps: [
        {
          text: "Petty cash (kas kecil, terpisah dari laci): Menu Kasir → Petty Cash → isi kategori, uraian, nominal, penerima, no. nota → Ajukan. Saldo baru berubah setelah disetujui Owner/Manajer.",
        },
        {
          text: "Uang laci keluar/masuk tetap lewat Kas Keluar / Masuk (isi sumber/penerima & no. bukti bila ada).",
        },
        {
          text: "Catatan kejadian: Menu Kasir → Catatan Kejadian → pilih kategori (selisih kas, gangguan QRIS/printer, komplain, produk habis, pergantian kasir, dll.), tulis kejadian, invoice terkait, dampak Rp, dan tindakan.",
        },
        {
          text: "Setelah tutup shift: Riwayat & Laporan Shift → buka shift → Laporan Lengkap (PDF). Nama file mengikuti tanggal operasional & nomor shift.",
          warn: "Laporan lengkap baru bisa diunduh kasir setelah shift ditutup (kas seharusnya dirahasiakan selama shift).",
        },
      ],
    },
    {
      id: "laporan",
      title: "15. Laporan penjualan shift saya",
      steps: [
        { text: "Buka POS → Laporan Shift → \"Penjualan shift saya\" untuk melihat produk terlaris, kategori dan metode bayar shift Anda." },
        { text: "Tekan Cetak ringkasan untuk mencetak ke printer struk, atau CSV untuk diunduh." },
      ],
    },
    {
      id: "masalah",
      title: "16. Masalah umum",
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

import type { RoleGuide } from "@/lib/role-guides/types";

/** Panduan Owner: kontrol bisnis, keuangan, keputusan final. */
export const ownerGuide: RoleGuide = {
  id: "owner",
  title: "Panduan Owner",
  summary: "Memantau bisnis, keputusan final persetujuan, pengaturan keuangan & gaji, dan pengawasan tim.",
  roles: ["Owner"],
  updatedAt: "2026-10-13",
  sections: [
    {
      id: "pantau",
      title: "1. Memantau bisnis",
      steps: [
        { text: "Dashboard / CEO Control: omzet, profit bersih, target, dan balik modal." },
        {
          text: "Profit bersih = omzet bersih − belanja bahan (penerimaan gudang lunas) − biaya tetap harian − biaya lain.",
        },
        { text: "Laporan Penjualan per tanggal: produk, kategori, metode bayar, jam ramai, per kasir." },
        { text: "Warehouse → Keuangan & HPP dan Owner Analytics untuk food cost & nilai stok." },
      ],
    },
    {
      id: "keputusan",
      title: "2. Keputusan final",
      steps: [
        { text: "Persetujuan: pengeluaran di atas batas Owner menunggu keputusan Anda." },
        { text: "Hanya Owner yang boleh menyetujui pengajuannya sendiri dan mengoreksi absen Manajer." },
        { text: "Membuka ulang closing harian/bulanan hanya Owner." },
      ],
    },
    {
      id: "pengaturan",
      title: "3. Pengaturan keuangan & gaji",
      steps: [
        { text: "Pengaturan Keuangan: biaya tetap harian, target profit bulanan, batas approval pengeluaran (Manajer & Owner), modal & saldo kas." },
        { text: "Batas approval otomatis (auto-sweep) memakai angka di Pengaturan Keuangan — tidak bisa diubah Manajer." },
        { text: "Payroll → Pengaturan: upah harian, lembur, fee per produk, potongan tetap, tanggal mulai kerja, THR." },
        { text: "Pajak & service saat ini 0%." },
      ],
    },
    {
      id: "tim",
      title: "4. Tim & keamanan",
      steps: [
        { text: "Manajemen Tim: kelola akun Manajer dan semua karyawan. Akun baru / reset wajib ganti password sebelum bisa bekerja." },
        {
          text: "Profil karyawan: Manajemen Tim → Direktori → klik nama atau tombol Profil (juga di Payroll → Karyawan). Isi data diri, kontak darurat, rekening gaji, kontrak, dan unggah foto/KTP/CV.",
          warn: "NIK, nomor rekening, dan file KTP hanya terlihat penuh oleh Owner — Manajer melihat versi tersamar.",
        },
        { text: "Pelamar yang dijadikan karyawan otomatis membawa WA, alamat, tanggal lahir, foto, KTP, dan CV dari lamarannya." },
        { text: "PIN Owner/Manajer hanya untuk persetujuan di tablet kasir — jangan diberikan ke kasir." },
        { text: "Audit: periksa void, refund, koreksi absen, penerimaan barang, dan perubahan harga." },
      ],
    },
    {
      id: "wa-wifi",
      title: "5. WhatsApp pelanggan & WiFi member",
      steps: [
        { text: "Pengaturan → Pembayaran: isi Rekening transfer pelanggan (satu per baris: BANK | NOMOR | ATAS NAMA). Tampil di menu digital saat pelanggan pilih Transfer." },
        { text: "Pelanggan menu digital yang bayar Transfer/QRIS bisa mengunggah bukti bayar dan mengirim ringkasan pesanan ke WhatsApp Garage." },
        { text: "CRM: filter WA belum dicek untuk melihat member yang nomornya belum dipastikan aktif." },
        {
          text: "WiFi gratis khusus member: isi GARAGE_WIFI_SECRET & GARAGE_WIFI_ROUTER_KEY di server, aktifkan di Pengaturan → WiFi Member, lalu pasang perintah MikroTik dari Pengaturan → Integrasi → WiFi Gratis Member.",
          tip: "Panduan lengkap: docs/WIFI-MIKROTIK.md.",
        },
      ],
    },
    {
      id: "grand-opening",
      title: "6. Grand Opening & Undangan Digital",
      intro: "Satu data event untuk banner homepage, halaman /grand-opening, dan undangan pribadi.",
      steps: [
        { text: "Menu Undangan Digital → periksa judul, tanggal, jam, alamat, link Maps, WhatsApp, dan highlight. Isi hanya informasi yang sudah pasti." },
        {
          text: "Tekan Terbitkan setelah semua benar. Banner homepage dan halaman garagecoffee.id/grand-opening langsung tampil.",
          warn: "Selama status Draft, halaman /grand-opening tidak bisa dibuka publik. Perubahan tanggal/jam/alamat tercatat di Audit.",
        },
        { text: "FAQ dan galeri hanya tampil bila diisi; jangan isi performer/promo yang belum terkonfirmasi." },
      ],
    },
    {
      id: "agent",
      title: "7. Agent AI (WhatsApp / Telegram)",
      intro: "OpenClaw / Hermes bisa mengontrol Garage OS dari WhatsApp atau Telegram memakai API key agent.",
      steps: [
        { text: "Pengaturan → Integrasi → API Key Agent AI → Buat key. Pilih hak akses: Owner penuh, Manajer, atau Baca-saja." },
        {
          text: "Salin key (hanya tampil sekali) dan konfigurasi MCP ke agent: URL /api/mcp + header Authorization: Bearer key.",
          warn: "Key Owner penuh bisa void/refund, catat pengeluaran, dan setujui pengajuan langsung. Jangan bagikan key; cabut segera bila bocor.",
        },
        { text: "Semua aksi agent tercatat di Audit dengan nama \"Agent <nama key>\"." },
        { text: "Panduan teknis lengkap: docs/AGENT-API.md." },
      ],
    },
  ],
};

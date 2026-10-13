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
        { text: "PIN Owner/Manajer hanya untuk persetujuan di tablet kasir — jangan diberikan ke kasir." },
        { text: "Audit: periksa void, refund, koreksi absen, penerimaan barang, dan perubahan harga." },
      ],
    },
    {
      id: "agent",
      title: "5. Agent AI (WhatsApp / Telegram)",
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

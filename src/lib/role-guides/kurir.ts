import type { RoleGuide } from "@/lib/role-guides/types";

/** Panduan Kurir delivery (akun Waiter dengan workstation "kurir"). */
export const kurirGuide: RoleGuide = {
  id: "kurir",
  title: "Panduan Kurir Delivery",
  summary: "Mengambil pesanan delivery yang sudah lunas, mengantar dengan GPS, dan menyelesaikan dengan foto bukti.",
  roles: ["Waiter"],
  workstations: ["kurir"],
  updatedAt: "2026-10-12",
  sections: [
    {
      id: "mulai",
      title: "1. Mulai kerja",
      steps: [
        { text: "Login dengan akun kurir. Layar pertama adalah Kurir (Antaran saya)." },
        { text: "Absen masuk di menu Absensi (PIN, selfie, GPS)." },
        { text: "Tekan Siap antar → status Tersedia (hijau). Istirahat = Offline, Anda tidak menerima pesanan." },
        { text: "Izinkan lokasi (GPS) dan notifikasi di HP. Lokasi hanya dibagikan saat pesanan sedang diantar." },
      ],
    },
    {
      id: "terima",
      title: "2. Mendapat pesanan",
      steps: [
        { text: "Ditugaskan kasir: muncul notifikasi Antaran baru di HP." },
        { text: "Ambil sendiri: di daftar Siap antar · ambil sendiri, tekan Ambil (hanya saat status Tersedia)." },
        { text: "Satu kurir membawa satu antaran. Selesaikan dulu sebelum mengambil pesanan berikutnya." },
        { text: "Pesanan delivery selalu sudah lunas (QRIS). Kurir tidak menagih uang." },
      ],
    },
    {
      id: "antar",
      title: "3. Mengantar",
      steps: [
        {
          text: "Tunggu sampai badge Produksi menunjukkan semua siap, lalu tekan Ambil pesanan di kasir.",
          warn: "Tombol Ambil pesanan terkunci selama Bar/Dapur masih membuat pesanan.",
        },
        { text: "Cek isi pesanan, alamat, dan catatan. Pakai tombol Rute (peta), WA, atau Telepon untuk menghubungi pelanggan." },
        { text: "Tekan Mulai antar. GPS terkirim otomatis kira-kira tiap 15 detik (badge GPS terkirim hh:mm)." },
        { text: "Sampai di tujuan: tekan Ambil foto bukti terkirim, foto pesanan diterima pelanggan." },
        { text: "Tekan Sudah sampai. GPS berhenti dan pesanan pindah ke Selesai diantar." },
      ],
      faq: [
        { q: "Kasir mengganti kurir?", a: "Hanya bisa sebelum pesanan diambil. Setelah Ambil pesanan, pesanan tetap milik Anda sampai selesai." },
        { q: "Pesanan dibatalkan saat di jalan?", a: "Hubungi kasir. Status Anda otomatis kembali Tersedia setelah order dibatalkan." },
      ],
    },
    {
      id: "selesai",
      title: "4. Selesai kerja",
      steps: [
        { text: "Pastikan tidak ada antaran yang masih berjalan, lalu tekan Istirahat." },
        { text: "Absen pulang di menu Absensi, lalu logout." },
      ],
    },
  ],
};

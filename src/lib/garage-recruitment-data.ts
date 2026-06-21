// Konstanta & tipe recruitment yang AMAN untuk client (tanpa import DB/server).
// Dipakai bersama oleh service (server) dan komponen client.

export type RecruitmentPosition = {
  slug: string;
  title: string;
  location: string;
  type: string;
  experience: string;
  description: string;
};

export const RECRUITMENT_POSITIONS: RecruitmentPosition[] = [
  { slug: "barista", title: "Barista", location: "Tebing Tinggi", type: "Full-time", experience: "Fresh graduate / berpengalaman", description: "Meracik kopi & minuman sesuai standar Garage, layani pelanggan dengan ramah." },
  { slug: "cashier", title: "Cashier", location: "Tebing Tinggi", type: "Full-time", experience: "Min. SMA/SMK", description: "Operasikan POS, tangani transaksi & pembayaran, jaga akurasi kas." },
  { slug: "kitchen-crew", title: "Kitchen Crew", location: "Tebing Tinggi", type: "Full-time", experience: "Fresh graduate / berpengalaman", description: "Siapkan makanan sesuai resep & standar kebersihan dapur Garage." },
  { slug: "content-creator", title: "Content Creator", location: "Tebing Tinggi / Hybrid", type: "Full-time", experience: "Portfolio wajib", description: "Buat konten foto/video untuk sosial media Garage, kreatif & up-to-date tren." },
  { slug: "admin", title: "Admin", location: "Tebing Tinggi", type: "Full-time", experience: "Min. SMA/SMK", description: "Kelola administrasi operasional, data, dan dukungan tim harian." },
  { slug: "supervisor", title: "Supervisor", location: "Tebing Tinggi", type: "Full-time", experience: "Min. 1 tahun di F&B", description: "Pimpin shift, jaga kualitas layanan & disiplin tim outlet." },
  { slug: "store-manager", title: "Store Manager", location: "Tebing Tinggi", type: "Full-time", experience: "Min. 2 tahun manajemen F&B", description: "Tanggung jawab penuh operasional outlet, target, dan pengembangan tim." },
  { slug: "helper", title: "Helper / Crew Outlet", location: "Tebing Tinggi", type: "Full-time", experience: "Fresh graduate welcome", description: "Bantu operasional outlet, kebersihan, dan kebutuhan tim sehari-hari." },
];

export const RECRUITMENT_STATUSES = [
  "Pelamar Baru",
  "Sedang Direview",
  "Dijadwalkan Interview",
  "Selesai Interview",
  "Diterima",
  "Ditolak",
  "Disimpan",
] as const;

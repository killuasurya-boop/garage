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
  { slug: "waiter", title: "Waiter / Pelayan", location: "Tebing Tinggi", type: "Full-time", experience: "Fresh graduate welcome", description: "Antar pesanan ke meja, jaga kebersihan area, dan layani tamu dengan ramah & cepat." },
  { slug: "content-creator", title: "Content Creator", location: "Tebing Tinggi / Hybrid", type: "Full-time", experience: "Portfolio wajib", description: "Buat konten foto/video untuk sosial media Garage, kreatif & up-to-date tren." },
  { slug: "admin", title: "Admin", location: "Tebing Tinggi", type: "Full-time", experience: "Min. SMA/SMK", description: "Kelola administrasi operasional, data, dan dukungan tim harian." },
  { slug: "supervisor", title: "Supervisor", location: "Tebing Tinggi", type: "Full-time", experience: "Min. 1 tahun di F&B", description: "Pimpin shift, jaga kualitas layanan & disiplin tim outlet." },
  { slug: "store-manager", title: "Store Manager", location: "Tebing Tinggi", type: "Full-time", experience: "Min. 2 tahun manajemen F&B", description: "Tanggung jawab penuh operasional outlet, target, dan pengembangan tim." },
  { slug: "helper", title: "Helper / Crew Outlet", location: "Tebing Tinggi", type: "Full-time", experience: "Fresh graduate welcome", description: "Bantu operasional outlet, kebersihan, dan kebutuhan tim sehari-hari." },
];

export const RECRUITMENT_STATUSES = [
  "Baru",
  "Diproses",
  "Interview",
  "Diterima",
  "Ditolak",
  "Talent Pool",
] as const;

/** Normalisasi nomor WhatsApp pelamar: 0812… / +62812… / 62812… → 62812… */
export function normalizeApplicantPhone(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

/** Link dokumen hasil upload resmi (/api/recruitment/files/...). */
export const RECRUITMENT_FILE_URL =
  /^\/api\/recruitment\/files\/(cv|photo|ktp|portfolio|certificate)-\d{13}-[a-f0-9]{8}\.(pdf|doc|docx|jpg|png|webp)$/;

/** URL tautan publik (sosmed/portfolio) wajib https. */
export const HTTPS_URL = /^https:\/\/[^\s"'<>]{3,480}$/i;

/** Lowongan dibuka WhatsApp grup pelamar (satu sumber). */
export const RECRUITMENT_WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/HQ6hItzXVgULWHVwlw7mDd";

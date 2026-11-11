// =============================================================================
// Daftar resmi route API yang SENGAJA publik (tanpa sesi staf). Audit 29 Okt 2026 (#3):
// setiap route.ts wajib memanggil guard yang dikenal ATAU terdaftar di sini beserta
// alasannya — dijaga tes api-route-auth.test.ts. Route baru tanpa guard = tes gagal.
// `abuseGuard`: bagaimana route publik ini dilindungi dari penyalahgunaan.
// =============================================================================

export type PublicRoute = { reason: string; abuseGuard: "rateLimit" | "pin" | "token" | "readonly" | "none" };

export const PUBLIC_API_ROUTES: Record<string, PublicRoute> = {
  // Sistem
  health: { reason: "Health check pemantau & deploy", abuseGuard: "readonly" },
  errors: { reason: "Laporan error dari browser kasir/pelanggan", abuseGuard: "rateLimit" },
  "push/vapid": { reason: "Kunci PUBLIK web push (bukan rahasia)", abuseGuard: "readonly" },
  "csp-report": { reason: "Laporan pelanggaran CSP dari browser (report-only)", abuseGuard: "rateLimit" },
  "agent/v1/openapi.json": { reason: "Spesifikasi API agent (tanpa data)", abuseGuard: "readonly" },
  "website-events": { reason: "Daftar event untuk website publik", abuseGuard: "readonly" },
  "wifi/config": { reason: "SSID & durasi WiFi member (tanpa password)", abuseGuard: "readonly" },
  "site/live-tracking": { reason: "Statistik kunjungan website", abuseGuard: "rateLimit" },
  "site/live-visit": { reason: "Penghitung kunjungan website", abuseGuard: "rateLimit" },
  // Pelanggan (menu digital / meja / pesanan sendiri)
  "customer/menu": { reason: "Menu digital pelanggan", abuseGuard: "rateLimit" },
  "customer/ordering-status": { reason: "Status buka/tutup pemesanan", abuseGuard: "rateLimit" },
  "customer/qr": { reason: "QR meja pelanggan", abuseGuard: "rateLimit" },
  "customer/qr-card": { reason: "Kartu QR meja", abuseGuard: "rateLimit" },
  "customer/qr-cards/pdf": { reason: "PDF kartu QR meja (hanya URL publik meja)", abuseGuard: "rateLimit" },
  "customer/tables/live": { reason: "Peta meja publik (tanpa kode gabung)", abuseGuard: "rateLimit" },
  "customer/tables/hold": { reason: "Pelanggan memegang meja sementara", abuseGuard: "rateLimit" },
  "customer/service-requests": { reason: "Panggil waiter dari meja", abuseGuard: "rateLimit" },
  "customer/chat": { reason: "Chat pelanggan ↔ kasir", abuseGuard: "rateLimit" },
  "customer/chat/upload": { reason: "Lampiran chat pelanggan", abuseGuard: "rateLimit" },
  "customer/orders/payment-proof": { reason: "Unggah bukti bayar pelanggan", abuseGuard: "rateLimit" },
  "customer/orders/[id]/public-status": { reason: "Status pesanan untuk pelanggan", abuseGuard: "rateLimit" },
  "customer/orders/[id]/push": { reason: "Langganan notifikasi pesanan pelanggan", abuseGuard: "rateLimit" },
  "display/customer-queue": { reason: "Layar antrean pelanggan", abuseGuard: "rateLimit" },
  "invoice/[token]/live-status": { reason: "Invoice publik ber-token acak", abuseGuard: "token" },
  "public/events/[slug]/menu": { reason: "Menu event publik", abuseGuard: "readonly" },
  "vouchers/validate": { reason: "Cek voucher saat checkout pelanggan", abuseGuard: "rateLimit" },
  "invitations/[token]/rsvp": { reason: "RSVP undangan ber-token", abuseGuard: "token" },
  // Akun member (auth sendiri: nomor/email + PIN, JWT cookie)
  "member/auth/login": { reason: "Login member", abuseGuard: "rateLimit" },
  "member/auth/register": { reason: "Daftar member", abuseGuard: "rateLimit" },
  "member/auth/refresh": { reason: "Perbarui sesi member (refresh token)", abuseGuard: "rateLimit" },
  "member/auth/logout": { reason: "Keluar member (hanya menghapus cookie)", abuseGuard: "none" },
  "member/auth/otp/status": { reason: "Apakah OTP WhatsApp aktif (tanpa data)", abuseGuard: "rateLimit" },
  "member/auth/otp/request": { reason: "Kirim kode OTP WhatsApp pendaftar (batas per IP + per nomor)", abuseGuard: "rateLimit" },
  "member/auth/otp/verify": { reason: "Cek kode OTP (maks. 5 percobaan per kode)", abuseGuard: "rateLimit" },
  "partner/auth/login": { reason: "Login Portal Mitra (nomor HP + PIN)", abuseGuard: "rateLimit" },
  "member/auth/claim/verify": { reason: "Cek kode klaim dari kasir (maks. 5 percobaan per kode, berlaku 15 menit)", abuseGuard: "rateLimit" },
  "member/auth/providers": { reason: "Metode login member yang aktif (tanpa data)", abuseGuard: "readonly" },
  "member/auth/google/start": { reason: "Mulai login Google member (redirect + state PKCE)", abuseGuard: "rateLimit" },
  "member/auth/google/callback": { reason: "Kembali dari Google (state + PKCE + ID token diverifikasi)", abuseGuard: "rateLimit" },
  "member/auth/google/pending": { reason: "Profil Google menunggu dilengkapi (cookie bertanda tangan)", abuseGuard: "rateLimit" },
  "member/auth/google/complete": { reason: "Aktivasi member dari Google (cookie bertanda tangan + S&K)", abuseGuard: "rateLimit" },
  // Rekrutmen publik
  "recruitment/positions": { reason: "Lowongan terbuka", abuseGuard: "readonly" },
  "recruitment/apply": { reason: "Lamaran kerja", abuseGuard: "rateLimit" },
  "recruitment/upload": { reason: "Unggah berkas lamaran", abuseGuard: "rateLimit" },
  "recruitment/parse-cv": { reason: "Baca CV pelamar (AI)", abuseGuard: "rateLimit" },
  "recruitment/track-status": { reason: "Cek status lamaran", abuseGuard: "rateLimit" },
  // Kiosk absensi (auth = KODE/PIN karyawan + geofence; pembatas tebakan PIN persisten)
  "absen/me": { reason: "Kiosk absen: data karyawan via KODE + PIN", abuseGuard: "pin" },
  "absen/punch": { reason: "Kiosk absen: check-in/out via KODE + PIN + GPS", abuseGuard: "pin" },
  "absen/slip": { reason: "Kiosk absen: slip via KODE + PIN", abuseGuard: "pin" },
  "hr/attendance": { reason: "Kiosk absen lama via PIN", abuseGuard: "pin" },
  "hr/attendance/check": { reason: "Kiosk absen lama: cek status via PIN", abuseGuard: "pin" },
};

/** Pola pemanggilan guard yang dikenali (sesi staf, terminal POS, job, webhook, wrapper modul). */
export const KNOWN_ROUTE_GUARDS = [
  /\brequire(?:Garage|Any|Owner|Mcp|Permission|Human|Cashier|Account|PosTerminal|Member|Customer|Staff|Partner)[A-Za-z]*\(/,
  /\brequireGarageAiJobAuthorization\(/,
  /\bresolveAgent[A-Za-z]*\(/,
  /\bverifyMember[A-Za-z]*\(/,
  /\bgetMemberSession\(/,
  /\bsecretsMatch\(/,
  /\btoNextJsHandler\(/,
  /\bauth\.handler\b/,
  /\bfinanceSectionHandler\(/,
  /\breplenishmentSession\(/,
  /\blegacyInventoryGone\(/,
  /\bverifyMetaWebhookSignature\(/,
];

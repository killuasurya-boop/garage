// Status platform GIGS lama (Owner 23 Nov 2026): container platform DIMATIKAN (docker stop, data tetap ada).
// Selama true, tombol yang membaca platform langsung (Impor lineup, Impor RAB, Impor Dashboard Penyelenggara,
// Isi dari angka platform) disembunyikan karena pasti gagal. Halaman publik event tetap jalan dari salinan Garage OS.
// Platform dinyalakan lagi di VPS → set NEXT_PUBLIC_EVENT_PLATFORM_RETIRED=0 saat build (atau ubah di sini) agar tombol
// tampil kembali. E2E memakai platform tiruan dan menyetel 0 (e2e/start-server.mjs) supaya fitur impor tetap teruji.
export const EVENT_PLATFORM_RETIRED = process.env.NEXT_PUBLIC_EVENT_PLATFORM_RETIRED !== "0";

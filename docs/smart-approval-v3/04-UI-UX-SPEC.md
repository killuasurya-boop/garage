# Smart Approval V3 — 04 Spesifikasi UI/UX

Halaman `/control/decision` (Owner), menu "Decision Center". Palet Garage (keputusan Owner 6 Nov): charcoal, cream, merah,
amber; hijau hanya untuk aman/setuju. Tema **Garage Gelap/Terang** per perangkat (`garage:decision-center-theme`).

- KPI nyata: Menunggu, Risiko tinggi (R3), Gagal dijalankan, Rata-rata waktu keputusan (hari ini), Diputus hari ini.
- Antrean prioritas (gagal → R3 → umur → nominal), tab Menunggu/Disetujui/Ditolak/Semua, filter risiko, cari.
- Detail: stepper dari status nyata; A Masalah · B Hasil pemeriksaan (sumber) · C Fakta/Dugaan/Belum diketahui ·
  D Rekomendasi AYA · E Konsekuensi per tindakan · F Risiko & manfaat · G Perubahan yang akan dilakukan + sebelum/sesudah ·
  H Status pelaksanaan · I Tindak lanjut · J Timeline audit · Tanya AYA.
- Aksi: Setujui (hijau) · Tolak (merah) · Tunda · Minta Revisi → dialog konsekuensi, catatan, kode 2FA untuk R3.
- Responsif: desktop daftar + detail 2 kolom; tablet daftar-detail; HP daftar → detail + bar aksi lengket bawah.
- Aksesibilitas: status selalu ikon + teks, target ≥ 44 px, fokus terlihat, `prefers-reduced-motion`.
- Halaman terkait: `/control/aya-solver` (Problem Solver), `/control/intelligence` (Living Intelligence).

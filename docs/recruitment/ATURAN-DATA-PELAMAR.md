# Aturan data pelamar (Owner 19 Nov 2026)

| Data | Disimpan |
|---|---|
| Pelamar diterima / sudah jadi karyawan | Berkas (KTP, CV, foto, sertifikat) disimpan selama bekerja |
| Ditolak / Talent Pool | Berkas dihapus otomatis 6 bulan (180 hari) setelah keputusan (`status_changed_at`, migrasi 0205); ubah catatan/skor tidak memperpanjang |
| Baru / Diproses / Interview tanpa kabar | Dianggap selesai setelah 90 hari, lalu ikut aturan 6 bulan |
| Unggahan yang tidak jadi dipakai melamar | Dihapus setelah 24 jam |

Nama, posisi, dan status tetap disimpan sebagai riwayat. Hasil baca CV otomatis (`cv_parsed_data`) ikut dihapus.

Teknis:
- Aturan murni: `src/lib/recruitment-retention.ts`; sapuan: `sweepRecruitmentFiles` (`src/lib/recruitment-storage.ts`),
  tiap hari 03.41 WIB lewat `runMonitoredJob("recruitment_files")`, satu baris Audit per sapuan.
- Unggah publik: 12/menit + 30/jam per IP; total berkas maksimal 2 GB (penuh → 507 + notifikasi Owner sekali per hari).
- Lamaran dobel (nomor dinormalisasi `0812…` = `+62812…`, email tanpa beda huruf): pesan netral tanpa tanggal/status.
  Status hanya lewat Cek Status (WA + email).
- Tidak ada lowongan dibuka → lamaran ditolak.
- Membuka berkas KTP pelamar (Owner/Manajer) dicatat di Audit "Buka KTP pelamar".
- Teks persetujuan form menyebut masa simpan dan baca CV dengan AI (Google Gemini).

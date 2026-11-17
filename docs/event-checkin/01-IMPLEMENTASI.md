# Check-in Tamu di Pintu

Owner, 16 Nov 2026. Melengkapi undangan digital: RSVP adalah janji, check-in adalah kehadiran nyata.

## Alur

1. Halaman undangan tamu (`/undangan/<token>`) menampilkan **Kartu masuk**: QR berisi tautan undangan itu sendiri
   (dibuat di server, gelap di atas pelat putih). Setelah dipakai masuk, kartu berganti "Sudah masuk pukul …".
2. Petugas pintu membuka **`/checkin`** dari HP (semua staf yang login: Owner, Manajer, Kasir, Waiter; API key agent
   ditolak). Event hari ini dipilih otomatis; pilihan disimpan di perangkat.
3. **Scan QR** (kamera HP, atau scanner USB / tempel tautan) → kartu tamu: nama, batas orang, status RSVP, peringatan.
   Petugas mengatur jumlah orang (bawaan = RSVP, maks batas undangan) → **Masuk**.
4. **Satu undangan, satu kali masuk**: kunci baris + indeks unik parsial. Scan kedua menampilkan jam & petugas yang
   mencatat. Dua petugas bersamaan → hanya satu yang tercatat.
5. QR untuk event lain → pesan nama event yang benar + tombol "Ganti ke event itu" (tanpa membuka nama tamu).
6. **Cari nama** (nama / nomor HP; nomor tidak dikirim balik) untuk tamu tanpa QR.
7. **Walk-in** (tamu tanpa undangan): jumlah orang + nama opsional, idempoten per kunci layar (`client_key`).
8. **Batalkan check-in**: Owner/Manajer + alasan. Baris tidak dihapus (`undone_at`), undangan bisa dipakai lagi.

Peringatan (tetap boleh masuk): RSVP tidak hadir, belum RSVP, jumlah orang lebih dari RSVP. Penolakan: undangan dicabut,
tamu dihapus, event diarsipkan, sudah masuk, lebih dari batas undangan.

## Rekap (papan pintu, segar tiap 10 detik)

Sudah masuk (orang) = orang dari undangan + walk-in; undangan masuk X/Y; % datang dari RSVP hadir (orang).

## Berkas

- Migrasi `0197_event_checkins` (tabel `event_checkins`); reset grand opening = CLEAR; staging menyamarkan nama.
- Aturan murni `src/lib/event-checkin-rules.ts`; server `src/lib/event-checkin-service.ts`; API `/api/event-checkin/**`
  (`requireStaffSession`); layar `src/app/checkin/page.tsx` + `src/components/garage/events/event-checkin-panel.tsx`
  (pemindai bersama `useCodeScanner`); tombol "Check-in pintu" di modul Event.
- Jejak: `event_activity_logs` (`checked_in`, `walkin`, `checkin_undone`).

## Uji

- `event-checkin-rules.test.ts`: isi QR, keputusan, jumlah bawaan, rekap.
- `event-checkin.integration.test.ts`: pratinjau tidak mencatat, masuk sekali, scan ganda & bersamaan, cari nama tanpa
  nomor HP, QR asing, walk-in idempoten, batal Owner/Manajer, API key agent ditolak.
- Browser: HP 390×844 (Kasir) — kamera, tempel tautan, event salah → ganti, masuk, scan ulang ditolak, cari nama,
  walk-in; desktop (Owner) — batal check-in. QR undangan didekode ulang = tautan undangan.

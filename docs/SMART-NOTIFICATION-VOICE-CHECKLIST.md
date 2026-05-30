# Smart Notification — Checklist Generate Voice MP3

Dokumen kerja untuk generate 22 file MP3 announcement Garage Coffee & Motor OS.
Setelah semua MP3 jadi, drop ke folder berikut, lalu beri tahu engineer untuk
verifikasi dan wiring scenario baru.

---

## 📂 Folder Tujuan

```
E:\PREJCT APLIKASI\G A R A G E\public\voice\scenarios\
```

File yang sudah ada di folder ini akan **ter-overwrite** — itu memang diinginkan
(replace versi Edge Gadis dengan versi voice baru pilihan kamu).

---

## ⚙️ Setting Generator yang Disarankan

Berlaku untuk semua TTS (Murf Studio, ElevenLabs, dll).

| Parameter | Nilai | Catatan |
|---|---|---|
| Voice | Female Indonesian (mis. Aulia / Indah / sejenisnya) | Konsisten satu voice di seluruh file |
| Language | Indonesian (id-ID) | Wajib id-ID, hindari Malay |
| Speed | +5% atau +10% | Sedikit cepat = lebih tegas |
| Pitch | Normal (0%) | Jangan terlalu tinggi |
| Style | Newscaster / Professional / Conversational | Hindari "Cheerful" atau "Excited" |
| Pause setelah titik | 0.3–0.5 detik | Jeda natural antar kalimat |
| Volume | -1 dB sampai -3 dB | Beri headroom |
| Format file | MP3 | High quality, 48kHz/16-bit kalau tersedia |
| Channel | Mono | Cukup untuk speech, file lebih kecil |

---

## ✅ Konvensi Nama File

- Lowercase
- Pakai dash `-` (bukan underscore)
- Ekstensi `.mp3`
- Nama harus **persis** sesuai daftar di bawah, atau aplikasi tidak akan
  mengenali file-nya

---

## 📋 Daftar 22 File MP3

### Bucket A — Operasional Lantai (7 file)

- [ ] **1. `order-new.mp3`** — POS order paid (kasir konfirmasi bayar)
  > Perhatian Kasir. Pesanan baru telah diterima di POS. Mohon segera diproses.

- [ ] **2. `airport-qr.mp3`** — QR meja masuk
  > Perhatian Kasir. Pesanan baru masuk dari meja melalui QR. Mohon segera dikonfirmasi.

- [ ] **3. `online-new.mp3`** — Order online (GoFood/Grab/Shopee)
  > Perhatian Kasir. Pesanan online baru telah diterima. Mohon segera diproses.

- [ ] **4. `kitchen-cooking.mp3`** — Tiket masuk dapur
  > Tim Dapur. Pesanan baru memasuki antrian masak. Mohon segera dipersiapkan.

- [ ] **5. `bar-mixing.mp3`** — Tiket masuk bar
  > Tim Bar. Pesanan minuman baru masuk antrian peracikan. Mohon segera dieksekusi.

- [ ] **6. `order-ready.mp3`** — Pesanan siap di pickup line
  > Perhatian. Pesanan telah selesai dan siap di pickup line. Mohon segera diambil.

- [ ] **7. `order-ready-deliver.mp3`** — Runner antar ke meja
  > Runner. Pesanan siap diantar ke meja. Mohon segera diserahkan ke pelanggan.

### Bucket B — Peringatan Sistem (2 file)

- [ ] **8. `warning-printer.mp3`** — Printer error
  > Peringatan. Printer struk tidak terhubung. Mohon segera diperiksa.

- [ ] **9. `warning-lowstock.mp3`** — Stok menipis
  > Peringatan Gudang. Persediaan barang menipis. Mohon segera diisi ulang.

### Bucket C — Manager / Owner Critical (5 file)

- [ ] **10. `approval-pending.mp3`** — Approval pending
  > Manager. Permintaan persetujuan baru menunggu tindakan Anda. Mohon segera ditinjau.

- [ ] **11. `cash-anomaly.mp3`** — Selisih kas
  > Manager. Terdeteksi selisih kas pada penutupan shift. Mohon segera diverifikasi.

- [ ] **12. `delivery-pickup.mp3`** — Driver pickup
  > Perhatian Kasir. Kurir pengantaran telah tiba. Mohon serahkan pesanan sekarang.

- [ ] **13. `member-vip.mp3`** — VIP datang
  > Perhatian Tim. Member VIP telah tiba. Mohon utamakan dan sambut dengan layanan terbaik.

- [ ] **14. `audit-alert.mp3`** — Audit anomali
  > Perhatian Owner. Sistem audit mendeteksi anomali transaksi. Mohon segera ditinjau.

### Bucket D — Waiter Flow (4 file inti)

- [ ] **15. `waiter-call.mp3`** — Customer panggil waiter dari meja
  > Perhatian Waiter. Pelanggan di meja memerlukan bantuan. Mohon segera dilayani.

- [ ] **16. `waiter-bill-request.mp3`** — Customer minta bill
  > Perhatian Waiter. Pelanggan meminta tagihan. Mohon segera diantarkan ke meja.

- [ ] **17. `waiter-clear-table.mp3`** — Meja perlu dibersihkan
  > Perhatian Waiter. Meja perlu segera dibersihkan dan disiapkan kembali untuk pelanggan berikutnya.

- [ ] **18. `waiter-reservation.mp3`** — Reservasi datang
  > Perhatian Waiter. Tamu reservasi telah tiba. Mohon segera disambut dan diantar ke meja.

### Bucket E — Waiter Flow Tambahan (2 file opsional)

- [ ] **19. `waiter-special-request.mp3`** — Permintaan khusus dari meja
  > Perhatian Waiter. Terdapat permintaan khusus dari pelanggan. Mohon segera dikoordinasikan dengan dapur.

- [ ] **20. `waiter-refill.mp3`** — Refill / pesanan tambahan kecil
  > Perhatian Waiter. Pelanggan meminta refill atau tambahan pesanan ringan. Mohon segera dilayani.

### Bucket F — AI Alert & Test (2 file)

- [ ] **21. `ai-alert-high.mp3`** — Alert priority tinggi (AI Alerts Bell)
  > Perhatian. Terdapat tugas prioritas tinggi yang memerlukan tindakan segera.

- [ ] **22. `test-ceo.mp3`** — Tombol test suara CEO
  > Perhatian. Ini adalah tes suara Asisten Eksekutif Garage Coffee and Motor.

---

## 🎙️ Tips Pelafalan & Konsistensi

- Voice **sama** di semua 22 file (jangan campur Aulia + Indah, dll)
- Pelafalan istilah: **"POS"** dibaca "pi-o-es", **"QR"** dibaca "ki-yu-ar",
  **"GoFood/Grab/Shopee"** boleh dibaca utuh sebagai kata
- Jangan terlalu cepat — 1 file = 4–7 detik audio ideal
- Hindari intonasi naik di akhir kalimat (kesannya nanya) — biarkan flat /
  sedikit turun di akhir, lebih authoritative
- Test preview sebelum render: dengar apakah "Mohon segera diproses" terdengar
  natural, bukan robotik

---

## 📤 Setelah Semua MP3 Jadi

1. Drop semua 22 file ke `public\voice\scenarios\` (overwrite yang ada)
2. Beri tahu engineer untuk:
   - Verifikasi semua file ter-load via HTTP 200
   - Test trigger setiap scenario di Smart Notification Center
   - Wire-up scenario baru ke event handler real:
     - `waiter_*` → tombol table-call & bus-station di POS
     - `ai_alert_high` → ganti `voice.speakExecutive(...)` di
       `garage-ai-alerts-bell.tsx` jadi `voice.announce("ai_alert_high")`
     - `test_ceo` → ganti tombol Tes CEO di voice-settings-dialog jadi
       `voice.announce("test_ceo")`

---

## 📌 Status Saat Ini (Sebelum Generate)

- Folder `public\voice\scenarios\` punya **14 file MP3** versi Edge Gadis
  Neural (generated 2026-05-26, voice id-ID-GadisNeural)
- File **1–14** akan ter-overwrite saat kamu drop versi baru
- File **15–22** baru — slot kode-nya akan disiapkan engineer setelah voice
  ditambahin (channel `waiter`, scenario type baru, dll)

---

## 📊 Rekap Cepat

| Bucket | Jumlah | Target Audience |
|---|---|---|
| A. Operasional Lantai | 7 | Kasir, Dapur, Bar, Runner, All |
| B. Peringatan Sistem | 2 | Kasir, Gudang |
| C. Manager/Owner | 5 | Manager, Owner, Kasir, Tim |
| D. Waiter Inti | 4 | Waiter |
| E. Waiter Tambahan (opsional) | 2 | Waiter |
| F. AI Alert & Test | 2 | System / Test |
| **TOTAL** | **22** | |

Estimasi total audio: ~2–3 menit (cukup di bawah free tier 10 menit Murf).

---

_Dokumen ini dibuat 2026-05-26 sebagai panduan generate ulang voice library
Smart Notification Center._

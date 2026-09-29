# Panduan Operasional Payroll — Garage Coffee & Motor

Panduan harian untuk **Manajer** dan **Owner**: absen karyawan, koreksi, gajian,
kasbon, dan backup. Bagian terakhir (**Lampiran A**) adalah panduan singkat untuk
karyawan — cetak dan tempel di dekat kasir.

Semua menu ada di **Garage OS → Keuangan → Payroll**. Tab-tabnya:

| Tab | Untuk apa |
|---|---|
| Absen Hari Ini | Papan siapa yang sudah/belum datang, koreksi absen, izin/sakit/cuti |
| Rekap & Slip | Rekap bulanan per karyawan, cetak slip gaji (PDF) |
| Gajian & Kasbon | Bayar gaji, beri kasbon, batalkan salah input, backup |
| THR | Hitung & bayar THR per hari raya |
| Karyawan Absen | Tambah karyawan, reset PIN, jam masuk, gaji |
| Cek Kesiapan | Daftar hal yang harus beres sebelum dipakai sungguhan |
| Pengaturan | Lokasi GPS toko, aturan gaji |
| Payout Lama | Hanya riwayat alur lama (sudah ditutup). Semua pembayaran lewat **Gajian & Kasbon** |

---

## 1. Aturan gaji (ringkas)

| Aturan | Nilai |
|---|---|
| Jam masuk | 09:00 (Jaga Malam 23:00) |
| Upah harian | gaji bulanan ÷ 30, hanya untuk hari dengan absen masuk **dan** keluar |
| Telat | potong Rp 1.000 per menit |
| Telat 30 menit atau lebih | upah hari itu **hangus** |
| Lembur | hanya **Sabtu** lewat jam 23:00, Rp 3.000 per jam penuh |
| Fee produk | Rp 100 × produk terjual hari itu, untuk tiap karyawan yang hadir (kecuali Jaga Malam) |
| Bonus kehadiran | Rp 50.000/bulan, gugur bila pernah telat atau tidak hadir lebih dari 2 hari |
| Izin / sakit / cuti | tidak dibayar, tapi **tidak** menggugurkan bonus |

Fee dari order yang di-**void** atau item yang di-**refund** otomatis ditarik lagi.

---

## 2. Sebelum mulai dipakai (sekali saja)

Buka **Payroll → Cek Kesiapan**. Semua baris harus **Beres** (hijau/putih).
Yang paling sering belum beres:

1. **Lokasi GPS toko** — buka **Pengaturan** dari HP sambil berdiri di dalam toko,
   tekan **Pakai Lokasi Saya**, pastikan pin di peta tepat di toko, radius 50–100 m,
   lalu **Simpan**. Kalau masih titik contoh, semua absen ditolak "di luar radius".
2. **PIN karyawan** — tiap karyawan punya **kode** (mis. `BAR1`) dan **PIN 6 angka**.
   PIN hanya tampil sekali saat dibuat/di-reset. Kalau belum dibagikan:
   **Karyawan Absen → Reset PIN**, catat, berikan langsung ke orangnya.
3. **Uji coba** — minta 1–2 karyawan absen masuk & pulang dari HP di toko selama
   satu shift. Cek hasilnya di **Absen Hari Ini**.
4. **Batas persetujuan pengeluaran** — dengan batas Rp 1.000.000, setiap gajian
   bulanan (±Rp 1,5–2 juta) menunggu keputusan Owner di **Approvals** dulu.
   Kalau tidak diinginkan, naikkan batas di **Pengaturan Keuangan**.

---

## 3. Server & akses HP (setiap hari buka toko)

Laptop kasir menjalankan dua hal:

1. Server Garage (port 3001) — seperti biasa.
2. Akses absen untuk HP:

   ```bash
   npm run absen:https
   ```

   Layar menampilkan alamat lengkapnya, mis. *"Buka di HP karyawan:
   https://192.168.1.5:3443/absen"* — alamat itu yang dibuka karyawan dari HP. Pertama kali di tiap HP akan muncul
   peringatan keamanan → pilih **Lanjutkan / Advanced → Proceed**. Ini normal
   (sertifikat buatan sendiri).

HP dan laptop harus tersambung ke **WiFi toko yang sama**.

> Jangan matikan server dengan menutup paksa / mencabut listrik saat sedang
> dipakai — database bisa rusak. Matikan dengan `Ctrl + C` di jendela server.

---

## 4. Rutinitas harian Manajer

**Pagi (setelah jam masuk):**

1. Buka **Absen Hari Ini**. Lihat siapa **Belum datang** dan siapa **Telat**.
2. Karyawan izin/sakit hari ini → **Catat izin / sakit** (pilih jenis, tanggal & alasan).
   Izin tidak dibayar tapi bonus kehadirannya aman.

**Cek titip absen:** tiap kartu karyawan menampilkan **selfie masuk & keluar**
(klik untuk memperbesar). Bila muncul peringatan merah **"HP yang sama dipakai
absen oleh …"**, cocokkan selfie dengan orangnya — bisa jadi seseorang absen
memakai kode & PIN temannya. (Bisa juga wajar: HP karyawan mati lalu pinjam HP
teman — tanyakan langsung.)

**Kapan saja ada masalah absen:**

- **Lupa check-out / HP mati / salah jam** → tombol **Koreksi** di baris karyawan:
  isi jam masuk & keluar yang benar + alasan (wajib, minimal 5 huruf) →
  **Simpan koreksi**. Gaji dan fee hari itu dihitung ulang
  otomatis dan tercatat di Audit. Koreksi ditolak bila hari itu sudah digaji.
- **Lupa PIN** → **Karyawan Absen → Reset PIN**, berikan PIN baru langsung.
- **Salah PIN berkali-kali** → akun terkunci 5 menit, tunggu lalu coba lagi.

**Keesokan harinya jam 10:00** hari kemarin otomatis difinalkan (lupa check-out
jadi "tidak valid", fee dibagi, bonus di akhir bulan). Kalau ada yang lupa
check-out, koreksi **sebelum** gajian.

---

## 5. Gajian

1. Buka **Gajian & Kasbon**.
2. Pilih **Bayar gaji sampai tanggal** — biasanya **Akhir bulan lalu**.
   - Ada kotak kuning "hari belum final"? Cek **Absen Hari Ini** dulu; hari itu
     belum ikut dibayar dan akan masuk gajian berikutnya.
3. Tabel menunjukkan per karyawan: **Gaji**, **Fee**, **Potong kasbon**,
   **Diterima**.
4. Tekan **Bayar** → periksa rinciannya → pilih **Tunai** atau **Transfer** →
   **Ya, bayar**.
5. Baca pesan hasilnya:
   - *"Pengeluaran tercatat di Finance"* → serahkan uang sekarang.
   - *"Menunggu persetujuan Owner di Approvals"* → **tunggu disetujui**, baru
     serahkan uang. Kalau Owner **menolak**, gajian otomatis batal dan gaji
     kembali "belum dibayar".
6. Cetak slip: **Rekap & Slip → Slip** (per orang) atau cetak semua. Slip
   menunjukkan **LUNAS / DIBAYAR SEBAGIAN / BELUM DIBAYAR**, tanggal bayar, dan
   sisa kasbon. Minta karyawan tanda tangan di kolom "Diterima oleh".

**Tunai:** uang diambil dari laci kas → **Kas seharusnya** sesi kas berkurang
otomatis. Pastikan sesi kas sedang **terbuka** saat membayar tunai.

Setiap gajian otomatis didahului **backup** data.

---

## 6. Kasbon

1. **Gajian & Kasbon → Beri kasbon** → pilih karyawan, nominal, metode, catatan.
2. Kasbon dipotong otomatis di gajian berikutnya (yang terlama dulu). Kalau
   kasbon lebih besar dari gaji, sisanya terbawa ke gajian berikutnya.
3. Kasbon ≥ batas persetujuan → **menunggu Approvals**: jangan serahkan uang
   dulu. Kasbon ini baru dipotong setelah disetujui; kalau ditolak, batal.
4. Karyawan bisa melihat sisa kasbon di HP-nya (halaman absen).

---

## 6b. THR (Tunjangan Hari Raya)

1. Owner mengisi **Tanggal mulai kerja** tiap karyawan di **Karyawan Absen**
   (kalau kosong, sistem memakai tanggal akun absen dibuat — ditandai "perkiraan").
2. Buka tab **THR** → isi nama hari raya (mis. *Idul Fitri 2027*) dan tanggalnya →
   **Hitung THR**.
3. Besaran otomatis: masa kerja ≥ 12 bulan = 1× gaji bulanan; 1–12 bulan =
   bulan/12 × gaji; di bawah 1 bulan = belum berhak.
4. **Bayar** per karyawan (Tunai/Transfer). Tercatat di Finance sebagai
   "THR Karyawan" (masuk laba rugi). Di atas batas persetujuan → tunggu Approvals.
5. THR tampil di slip gaji bulan pembayarannya (di luar gaji bulanan).
   Salah input → **Batalkan** di Riwayat THR.

> Ketentuan THR (batas waktu bayar, dsb.) mengikuti peraturan yang berlaku —
> konfirmasi ke Disnaker bila ragu.

## 6c. Potongan tetap bulanan (mis. iuran BPJS) & UMK

- **Potongan tetap / bulan** diisi Owner di **Karyawan Absen** (0 = tidak ada).
  Dipotong otomatis sekali di akhir bulan, tidak melebihi gaji yang diperoleh
  bulan itu, dan tampil di slip sebagai **Potongan tetap (BPJS)**. Nominal &
  kepesertaan BPJS ditentukan Owner sesuai ketentuan yang berlaku.
- **UMK**: Owner mengisi angka UMK resmi di **Pengaturan → UMK**. **Cek Kesiapan**
  memperingatkan bila ada gaji bulanan di bawah UMK.

## 7. Salah input? Batalkan

Di **Gajian & Kasbon → Riwayat gajian / Kasbon** → **Batalkan** → isi alasan →
**Ya, batalkan**.

| Yang dibatalkan | Akibatnya |
|---|---|
| Gajian | Gaji & fee kembali "belum dibayar", potongan kasbon dikembalikan, pengeluaran Finance dibatalkan, uang tunai dikembalikan ke kas seharusnya |
| Kasbon | Pengeluaran Finance dibatalkan (hanya kasbon yang **belum** dipotong gajian) |

Pembatalan **ditolak** bila sesi kas saat uang keluar sudah **ditutup** atau hari
itu sudah **Daily Closing** — catat penyesuaian manual di Keuangan.

---

## 8. Backup & pemulihan data

- Backup dibuat **otomatis sekali sehari** dan **sebelum setiap gajian**,
  disimpan di folder `backups/auto` (±10 MB per file; 14 harian + 20 manual).
- Tombol **Backup sekarang** ada di bawah halaman **Gajian & Kasbon**.
- **Salinan otomatis di luar laptop:** Owner mengisi **Pengaturan → Salinan
  Backup** dengan folder Google Drive (aplikasi Drive untuk komputer) atau
  flashdisk, mis. `{"copyToDir": "G:/My Drive/Garage Backup"}`. Setiap backup
  langsung ikut disalin ke sana (30 salinan terakhir disimpan). Kalau folder
  tidak ada (flashdisk dicabut), salinan gagal dan **Cek Kesiapan** memberi
  peringatan — backup di laptop tetap jadi.
- Kalau belum memakai salinan otomatis, **salin folder `backups/auto` ke
  flashdisk / Google Drive seminggu sekali.**
- Selfie absen **tidak** termasuk backup database. Kalau ingin menyimpannya,
  salin juga folder `storage/attendance` saat backup mingguan. Selfie lebih
  lama dari 90 hari dihapus otomatis (atur di Pengaturan → keamanan).

**Memulihkan** (hanya bila database rusak — server tidak bisa jalan):

1. Matikan server (`Ctrl + C`).
2. Lihat daftar backup:

   ```bash
   npm run db:restore
   ```

3. Pulihkan dari file yang dipilih:

   ```bash
   npm run db:restore -- backups/auto/garage-YYYYMMDD-HHMMSS-harian.tar.gz
   ```

4. Lalu:

   ```bash
   npm run db:migrate:runner
   ```

5. Nyalakan server lagi. Database lama tidak dihapus — disimpan sebagai
   `.pglite-data.before-restore-<waktu>`.

Data setelah waktu backup (absen/order hari itu) perlu dicek & dimasukkan ulang.

---

## 9. Masalah umum

| Masalah | Penyebab & solusi |
|---|---|
| "Anda …m dari toko (batas …m)" | GPS toko belum benar, radius terlalu kecil, atau HP belum dapat sinyal GPS. Cek **Pengaturan → GPS**; minta karyawan tunggu beberapa detik di dekat jendela lalu coba lagi. |
| Kamera / lokasi tidak mau jalan di HP | HP tidak membuka alamat **https**. Pastikan pakai `https://<IP>:3443/absen` dan izinkan kamera & lokasi di browser. |
| Halaman absen tidak bisa dibuka dari HP | HP tidak di WiFi toko, `npm run absen:https` belum jalan, atau IP laptop berubah (lihat IP baru di layar perintah tersebut). |
| "Kode atau PIN salah" | Cek kode (mis. `BAR1`). Lupa PIN → Reset PIN. |
| "Terlalu banyak percobaan salah" | Tunggu 5 menit. |
| "Akun absen nonaktif" | Karyawan dinonaktifkan Owner di **Karyawan Absen**. |
| Gaji hari ini belum muncul di HP | Gaji masuk setelah **check-out**. Fee & bonus dihitung esok hari jam 10:00. |
| Gajian tidak bisa (tidak ada yang dibayar) | Semua sudah dibayar s/d tanggal itu, atau harinya belum final. |

---

## Lampiran A — Panduan absen untuk karyawan (cetak & tempel)

**ABSEN LEWAT HP — GARAGE COFFEE & MOTOR**

1. Sambungkan HP ke **WiFi toko**.
2. Buka browser, ketik alamat: `https://________________:3443/absen`
   *(isi IP laptop kasir)*. Pertama kali: pilih **Lanjutkan** pada peringatan.
3. Masukkan **Kode karyawan** dan **PIN** (6 angka), tekan **Masuk**.
   **PIN rahasia — jangan diberikan ke siapa pun.**
4. Izinkan **Kamera** dan **Lokasi** bila diminta.
5. Saat datang: ambil selfie → tekan **Absen masuk**.
   Saat pulang: ambil selfie → tekan **Absen keluar**.
6. Absen hanya bisa dilakukan **di dalam toko**.

**Penting:**

- Tidak absen masuk **dan** pulang = hari itu **tidak digaji**.
- Jam masuk **09:00** (Jaga Malam **23:00**). Telat dipotong Rp 1.000/menit;
  telat 30 menit atau lebih, gaji hari itu hangus.
- Lupa absen / HP mati → **segera lapor Manajer** (hari yang sama).
- Di HP kamu bisa melihat gaji & fee yang belum dibayar, kasbon, riwayat, dan
  mengunduh **slip gaji**.

# Keputusan Owner (mengikat, menimpa PRD V4.0 bila bertentangan)

Urutan prioritas sumber: **keputusan di file ini → PRD V4.0 (`PRD/master-2026/PRD-GOS-UNIFIED-2026-004_V4.0.md`)
→ `CLAUDE.md` → dokumen lain.** Bila CLAUDE.md bertentangan dengan keputusan berstatus FINAL di sini,
agent yang mengerjakan batch terkait wajib memperbarui CLAUDE.md di PR yang sama.

Status: `FINAL` (diputuskan Owner) · `OPEN` (menunggu jawaban Owner).

---

## D-01 — MCP ChatGPT = FULL ACCESS Owner (FINAL, 2026-10-26)

**Kata Owner (Surya):** *"Untuk control MCP ChatGPT saya bertanggung jawab atas system, buat full akses
agar saya bisa kontrol apapun karena saya kontrol dari 1 pintu agent ChatGPT."*

### Apa artinya (wajib diimplementasikan)

1. **Satu pintu.** Owner mengendalikan seluruh Garage OS dari koneksi ChatGPT miliknya. Semua yang bisa
   Owner lakukan di UI Garage OS (16 domain, semua aksi R0–R3 di §07 PRD) **juga bisa dilakukan
   lewat MCP**, termasuk keuangan: approve/tolak cash-out, petty pay, konfirmasi setoran, review &
   final closing shift, void/refund, koreksi metode bayar, harga, resep, stok, role & approval staf,
   pengaturan, laporan, Drive, Gmail.
2. **Owner tidak dipaksa pindah ke UI.** Langkah "konfirmasi di Garage OS UI" pada PRD §22.1(6),
   §22.3 (Step-up), §22.4 (`approval.confirm` di UI) **diganti** dengan konfirmasi Owner di percakapan
   ChatGPT yang sama (lihat butir Mekanisme).
3. Berlaku **hanya** untuk principal Owner terverifikasi (Surya) yang terhubung lewat OAuth Garage OS.
   Manajer, kasir, agent lain (OpenClaw/Hermes) dan key `manajer`/`readonly` tetap dengan scope
   terbatas sesuai role mereka.

### Bagian PRD V4.0 yang ditimpa D-01

| Bagian PRD | Isi asli | Setelah D-01 |
|---|---|---|
| §00.3 baris "Kewenangan ChatGPT/MCP" | Bertahap, read-only dulu; daftar "tidak pernah via MCP" | Owner: full R0–R3 via MCP sejak gateway OAuth aktif |
| §22.1 (2), (6) | Default READ_ONLY; perubahan → review di Garage OS | Owner: read+write; konfirmasi di chat |
| §22.3 Step-up | Final closing & kas besar hanya di Owner UI | Boleh via MCP dengan konfirmasi chat (+ TOTP bila D-01a = ya) |
| §22.4 `approval.confirm` | Dikonfirmasi di Garage OS UI | Owner boleh konfirmasi lewat chat |
| §22.5 | Daftar tool ditolak (transfer dana, final closing, role kritis, dll.) | **Diizinkan untuk Owner**, kecuali butir R4 di bawah |
| §29 Fase 6 & go/no-go "tidak ada akses write chat ke arus uang" | Read-only dulu | Owner write diizinkan; gate tetap: test suite + kill-switch + audit |
| AC-M13 | MCP default read-only finance | Default Owner = full; read-only tetap untuk key `readonly` |

### Yang TETAP berlaku (bukan pembatasan kontrol Owner — UI Owner pun tidak bisa melakukannya)

R4 di PRD §07.2 tetap ditolak untuk semua jalur (UI, Aya, ChatGPT), karena merusak bukti, bukan "kontrol":
- hard delete / edit ledger `cash_ledger_entries`, audit log, transaksi historis — koreksi selalu lewat
  reversal/adjustment (Owner tetap bisa memerintahkan reversal lewat chat);
- SQL bebas, shell/VPS, membaca/menampilkan secret & token;
- potong gaji otomatis tanpa proses HR (§15 — alasan hukum PP 36/2021), tetap bisa diajukan Owner.

### Mekanisme teknis wajib (agar full access aman dan tidak menyalahi kontrol Owner)

1. **Autentikasi:** OAuth 2.1 + PKCE `/api/mcp/chatgpt` terikat akun Owner; bukan bearer `gk_agent_` statis.
   Token pendek + refresh + revoke + kill-switch di Pengaturan.
2. **Cakupan:** tool bisnis eksplisit per domain (registry, §04.1) memanggil service yang sama dengan UI —
   aturan bisnis & validasi identik. `garage_api` wildcard boleh dipertahankan **sementara** hanya untuk
   principal Owner sampai registry lengkap, dengan denylist R4 + audit penuh.
3. **Preview → konfirmasi → eksekusi** untuk R2/R3: tool mengembalikan preview (diff, dampak, digest,
   expiry); Owner menjawab "ya" di chat; ChatGPT memanggil commit dengan `confirmation_token` terikat digest.
   Idempotency key, expected version, readback, operation receipt (§07.5). Tanpa receipt → tidak boleh
   diklaim berhasil (P5).
4. **Anti prompt-injection (P8):** write hanya dieksekusi dari perintah Owner; isi data (catatan kasir,
   email, invoice) tidak pernah memicu commit. Konfirmasi digest mencegah eksekusi yang tidak dilihat Owner.
5. **Audit:** setiap call tercatat sinkron dengan `source=chatgpt`, actor Owner, tool, parameter tersensor,
   before/after, correlation_id. Audit gagal = aksi gagal.
6. **Separation of duties tetap untuk staf:** verifier ≠ pembuat tetap berlaku bagi kasir/manajer.
   Owner yang menyetujui lewat chat tercatat sebagai Owner (setara `self_approved`/"tanpa pemeriksa kedua"
   bila Owner juga pembuatnya), sesuai pola yang sudah ada di kode.

### Sub-keputusan terbuka D-01

- **D-01a (FINAL, 2026-10-28): ya.** Aksi R3 (final closing, role kritis, transfer dana, bulk harga) via chat
  butuh kode TOTP Owner (6 angka dari aplikasi authenticator) di panggilan konfirmasi, argumen `kode2fa`.
  Kode salah tidak menghanguskan token; kode yang sama tidak bisa dipakai ulang; secret tidak pernah keluar.
  Implementasi: `mcp-confirmation.ts` + `step-up-totp.ts` (tantangan terikat operasi & sidik argumen).
- **D-01b (OPEN):** paket ChatGPT Owner (Business/Enterprise/Edu mendukung custom MCP write). Bila tidak
  didukung → jalur sama lewat Aya in-app (F52).

---

## D-02 — Palet design system (FINAL, 2026-10-28: GELAP SEMUA)

**Keputusan Owner:** semua layar (staf, Owner, laporan di aplikasi) tetap **dark asphalt / chrome / merah / amber**
sesuai `design-system/MASTER.md`. Token light PRD §24.2 tidak dipakai. PDF cetak tetap latar putih (kertas).

Latar belakang:

PRD §24.2 mengusulkan token **light** (`#FAFAF8`, krem, putih hangat). `CLAUDE.md` & `design-system/MASTER.md`
mewajibkan **dark asphalt / chrome / merah / amber**. Butuh keputusan Owner sebelum batch UI (Fase 4).
Rekomendasi: pertahankan dark untuk staf (POS/KDS/kasir — PRD §24.3 "kasir prioritas keterbacaan"),
light opsional untuk Owner/laporan, uji lapangan dulu (PRD §31.2 butir 5).

## D-03 — Manager custody / brankas (FINAL, 2026-10-28: SETOR LANGSUNG KE BANK)

**Keputusan Owner: opsi (b).** Model tetap laci → setoran (`deposit_transit`) → rekening Jago/BNI, tanpa brankas
/ custody manajer. PRD §12 (akun Manager Received/Change Float/Safe) dan F09/F17 **tidak dibangun**; B4 dianggap
selesai penuh. Serah terima dua pihak tetap lewat konfirmasi setoran (penerima ≠ penyetor).

Latar belakang:

PRD §12 meminta akun custody manajer (Manager Received, Change Float, Safe/Hold) + serah terima dua pihak.
Keputusan Owner sebelumnya (CLAUDE.md, migration 0161): **setoran tanpa brankas, tanpa handover ke Owner**;
kategori `brankas` = `retired`; setoran = drawer → `deposit_transit` → bank. Owner perlu memilih:
(a) aktifkan kembali custody manajer sesuai PRD §12, atau (b) tetap model setoran langsung ke bank dan
§12 disesuaikan. Jangan implementasi F09/F17 sebelum diputuskan.

## D-04 — Email provider & Gmail (FINAL-by-PRD, perlu kredensial)

PRD §06.7 & §20.4 secara eksplisit meminta email transaksional (verifikasi) + Gmail. Ini adalah instruksi
Owner yang membuka larangan default CLAUDE.md "jangan tambah email provider". Masih butuh: pilihan
provider/domain (SPF/DKIM/DMARC), akun Google Workspace, scope OAuth (PRD §31.2 butir 7).

## D-05 — WhatsApp OTP (FINAL-by-PRD, perlu kredensial)

WhatsApp Business Platform resmi (sudah ada queue `garage-whatsapp-messaging.ts`). Butuh nomor bisnis,
template autentikasi disetujui Meta, anggaran per pesan (PRD §31.2 butir 8).

## D-06 — Keputusan terbuka lain dari PRD §31.2

Butir 1–12 PRD §31.2 tetap OPEN (tanggal efektif kebijakan kasir & label setoran Rp10.000, kasir tunggal vs
bergantian, penyedia QRIS & akses settlement, hardware, outlet, recovery OTP Owner, kontrak kerja/PP untuk
ganti rugi). Agent mencatat jawaban Owner di file ini.

---

## D-07 — Aya = AI pet companion Garage OS (FINAL, revisi Owner 2026-10-27 sore)

> **Revisi terakhir (27 Okt sore).** Owner mengirim sheet karakter "AYA — Garage OS AI Pet Companion" + video, dengan
> pesan: *"saya ingin dia bebas bergerak ke mana saja, dia seperti sticky button fly tapi bebas ke mana saja."*
>
> **Wujud:** makhluk digital mungil putih mutiara (≥85% putih) dengan:
> - kepala besar, badan buah pir, jambul melengkung;
> - **mata sipit setengah terpejam** (ciri utama);
> - piringan telinga perak;
> - **inti bintang merah** di dada.
>
> **Sifat:** ceria, centil, kadang ngambek, suka joget.
>
> **Perilaku UI:** pet **melayang** yang bisa diseret ke mana saja, sesekali terbang sendiri, dan membuka balon
> sapaan/pengingat. Wujud "robot chrome + visor" di bawah **diganti**; peran & siapa yang melihat (D-07d/e) tetap.
>
> Implementasi:
> - #109: `AyaCharacter`, 8 ekspresi + 5 pose, `AyaFloatingPet`.
> - #114: sambutan pelanggan `/order`.
> - #115: pengingat staf per divisi.


**Kata Owner (27 Okt):** *"Aya itu robot AI bermata sipit putih imut yang mengingatkan semua divisi untuk
kontrol kerjaan, di website juga ada untuk sambut dan ajak customer cari beli dll."*

> **Revisi.** Catatan 26 Okt (*"Masukan pet saya Aya dalam plan"*) sempat ditafsirkan sebagai hewan peliharaan.
> Owner meluruskan: Aya adalah **robot AI (maskot)**, bukan hewan. Bagian di bawah yang menyebut foto peliharaan,
> telinga/ekor, atau "jenis hewan" **tidak berlaku lagi**; jawaban final ada di tabel D-07a–e.

| Butir | Keputusan FINAL |
|---|---|
| D-07a Wujud | ~~Robot AI imut~~ → **AI pet companion putih bermata sipit** (sheet karakter Owner 27 Okt sore) |
| D-07b Foto | Tidak perlu foto. Maskot didesain dari deskripsi Owner (draf SVG di `public/garage-brand/aya/`, Owner menyetujui visual) |
| D-07c Gaya | Karakter vektor putih mutiara + aksen merah Garage, pet melayang bebas (seret/terbang/joget), mati saat reduced-motion |
| D-07d Peran & nada | **Pengingat kerja semua divisi** (bar, dapur, kasir, waiter, gudang, manajemen): tegas tapi ramah. Untuk Owner tetap gaya eksekutif |
| D-07e Siapa melihat | **Semua**: Owner, staf semua divisi, dan **pelanggan di website** (menyambut, mengajak melihat menu & membeli) |

Aya adalah satu sosok di semua pintu: Aya in-app, notifikasi, jawaban ChatGPT MCP (D-01), dan sambutan website.
Aturan tidak berubah: Aya tidak menjalankan aksi berisiko tanpa konfirmasi, tidak mengarang data, dan di website
tidak meminta data pribadi/pembayaran di luar alur checkout resmi.

### Ruang lingkup (masuk batch M5 + U1)

| Area | Rencana |
|---|---|
| Nama & sapaan | "Aya" di Owner Command Center (AI-01), asisten kontekstual (AYA-01), `chat-fab`, alert bell, owner chat, daily brief |
| Avatar / maskot | Ilustrasi Aya dibuat dari **foto asli peliharaan Owner** (bukan gambar internet / stok). Varian: avatar bulat kecil (24/32/48 px), ilustrasi besar untuk empty state & onboarding, ikon notifikasi. Simpan di `public/garage-brand/aya/`, render `object-contain` |
| Ekspresi status | Satu pose per state yang sudah wajib di PRD §24.8: siap/idle, sedang berpikir (loading), berhasil (dengan receipt), perlu perhatian (warning), gagal/belum terverifikasi. Ekspresi **selalu disertai teks**, tidak menggantikan label status |
| Kepribadian & suara | Ramah, setia, sigap — tetapi isi jawaban tetap mengikuti aturan PRD §21 (fakta vs dugaan, sumber angka, "BELUM CUKUP BUKTI", tidak menuduh). Persona baru ditambahkan di `src/lib/garage-ai-persona.ts` tanpa melemahkan guardrail; suara TTS existing (`garage-voice`, Edge/ElevenLabs/Gemini) dipilih ulang agar cocok dengan karakter Aya |
| Motion | Ringan: kedip/telinga/ekor sekali saat muncul atau saat tugas selesai; tidak ada animasi loop terus-menerus; hormati `prefers-reduced-motion` (CLAUDE.md, PRD §24.4) |
| Batas tampil | Default: workspace Owner & Manajer, panel AI, notifikasi. POS kasir hanya ikon kecil (tidak boleh menutupi menu/cart/total). Member UI: **tidak** tampil sampai Owner setujui terpisah (kontrak desain member terkunci, aturan #8) |
| Keamanan | Aya memakai backend, tool registry, dan policy yang sama dengan MCP (F52 = D-01). Aya tidak pernah mengklaim aksi berhasil tanpa operation receipt |

### Detail D-07a…e

Sudah dijawab Owner 27 Okt (tabel di atas). Kontrak desain member (`/member-login`) tetap terkunci: Aya di website
tampil di halaman menu/beranda, bukan mengubah layar login member tanpa persetujuan terpisah.

---

## D-09 — Final Bayar tunai: kolom "uang diterima" (FINAL atas delegasi Owner, 2026-10-27)

**Kata Owner:** *"final bayar itu saya gk paham, terbaikmu aja."* Diputuskan agent pertama:

- Kolom uang diterima **terisi otomatis = total tagihan** (satu ketuk "Uang pas"); kasir bisa menimpa bila
  pelanggan memberi uang lebih (kembalian dihitung).
- **Server tetap mewajibkan nominal ≥ total.** Tidak ada lagi "kosong dianggap uang pas" diam-diam (PRD §09.2
  tender guard).
- Alasan: kasir tetap secepat sekarang (satu ketuk), tapi setiap transaksi tunai punya nominal tercatat sehingga
  selisih laci bisa ditelusuri.
- Implementasi di area B3 milik agent kedua (#93/#98).

---

## D-10 — `garage_api` (alat wildcard agent) (FINAL atas delegasi Owner, 2026-10-27)

**Kata Owner:** *"jika tak berguna buang, jika berfungsi untuk kerja gunakan."*

- Setelah M3 (16/16 domain punya tool bisnis), aksi **mengubah data** lewat `garage_api` tidak diperlukan lagi
  dan melewati preview/konfirmasi → **dikunci: `garage_api` hanya GET (baca)**.
- Membaca endpoint yang belum punya tool tetap berguna untuk agent OpenClaw/Hermes → **dipertahankan sebagai alat
  baca**, diaudit per panggilan (#106).
- Di ChatGPT tetap tersembunyi (token OAuth tidak diterima endpoint lain).

---

## D-08 — Batas hari operasional (FINAL, 2026-10-26)

**Jawaban Owner:** hari operasional berakhir **04:00 WIB**; aturan berlaku **mulai tanggal efektif** (laporan &
closing yang sudah lewat tidak berubah angka). Menjawab PRD §02.4 "Cut-off business date" & sebagian D-06 butir 1.

- Implementasi: `src/lib/business-date.ts` (aturan + hari transisi 28 jam), pengaturan `businessDayCutoffHour` (4) &
  `businessDayEffectiveDate` (kosong = kalender). PR #87 (B1) + B1b.
- **Tanggal efektif belum ditentukan Owner** — diisi setelah B1b selesai (field baru muncul di Pengaturan → Shift & Cash).
- Kebijakan global (satu outlet); per outlet menyusul bila outlet bertambah.

## R1 — Staging (FINAL, 2026-10-28)

Owner mengizinkan staging **di VPS yang sama**: subdomain `staging.garagecoffee.id`, database terpisah berisi data
yang disamarkan (nama, telepon, email pelanggan/staf), app & DB staging dibatasi memori agar tidak mengganggu
produksi (RAM VPS 4 GB). Deploy produksi tetap lewat `scripts/deploy-manual.sh`.

## D-01b — ChatGPT hapus/arsip data non-uang (FINAL, 2026-10-29: TANPA 2FA)

**Keputusan Owner:** penghapusan/pengarsipan produk, staf, kategori, dll. lewat `ubah_data_garage` di ChatGPT
cukup **preview + konfirmasi di chat** (R2), tidak perlu kode 2FA. Perubahan **uang** tetap R3 + `kode2fa`
(D-01a, `isMoneyPath`). Audit 29 Okt #15 mencatat risiko *prompt injection*; mitigasi yang tetap berlaku:
jalur terlarang (`ubahDataBlockReason`), path ter-encode ditolak, sakelar `mcpChatgptWriteEnabled`, audit sinkron.

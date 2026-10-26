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

- **D-01a (OPEN):** apakah aksi R3 (final closing, role kritis, transfer dana, bulk harga) via chat butuh
  kode TOTP Owner diketik di chat? Rekomendasi: **ya** (kode 30 detik sekali pakai; tidak bocorkan secret).
  Bila Owner jawab tidak → konfirmasi "ya" saja.
- **D-01b (OPEN):** paket ChatGPT Owner (Business/Enterprise/Edu mendukung custom MCP write). Bila tidak
  didukung → jalur sama lewat Aya in-app (F52).

---

## D-02 — Palet design system (OPEN)

PRD §24.2 mengusulkan token **light** (`#FAFAF8`, krem, putih hangat). `CLAUDE.md` & `design-system/MASTER.md`
mewajibkan **dark asphalt / chrome / merah / amber**. Butuh keputusan Owner sebelum batch UI (Fase 4).
Rekomendasi: pertahankan dark untuk staf (POS/KDS/kasir — PRD §24.3 "kasir prioritas keterbacaan"),
light opsional untuk Owner/laporan, uji lapangan dulu (PRD §31.2 butir 5).

## D-03 — Manager custody / brankas (OPEN)

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

## D-07 — Aya = peliharaan Owner sebagai identitas asisten AI Garage OS (FINAL arah, detail OPEN, 2026-10-26)

**Kata Owner:** *"Masukan pet saya Aya dalam plan."*

Aya di PRD V4.0 (§21.5, AYA-01, F52) adalah asisten AI in-app. Keputusan Owner: **Aya diambil dari
peliharaan Owner** — nama, wajah/avatar, dan karakter asisten AI Garage OS. Aya adalah satu sosok yang sama
di semua pintu: Aya in-app, suara/notifikasi, dan jawaban ChatGPT MCP (D-01) bisa menyebut diri "Aya".

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

### Detail yang harus dijawab Owner (D-07a…e, OPEN)

- **D-07a** Jenis hewan Aya (kucing / anjing / lainnya) dan ciri utama (warna bulu, mata, aksesori).
- **D-07b** Foto Aya: Owner unggah 3–5 foto jelas (depan, samping, ekspresi favorit) ke
  `public/garage-brand/aya/source/` atau lampirkan di chat. Agent **tidak** mengarang wujud Aya tanpa foto.
- **D-07c** Gaya ilustrasi: flat/vektor yang selaras palet Garage (merah, chrome, amber) vs lebih realistis.
- **D-07d** Kepribadian & cara bicara Aya (mis. panggil Owner "Bos"/"Pak Surya"? boleh sedikit lucu atau
  tetap formal saat membahas uang?).
- **D-07e** Apakah Aya juga tampil untuk staf (kasir/bar/dapur) dan/atau member, atau khusus Owner & Manajer.

---

## D-08 — Batas hari operasional (FINAL, 2026-10-26)

**Jawaban Owner:** hari operasional berakhir **04:00 WIB**; aturan berlaku **mulai tanggal efektif** (laporan &
closing yang sudah lewat tidak berubah angka). Menjawab PRD §02.4 "Cut-off business date" & sebagian D-06 butir 1.

- Implementasi: `src/lib/business-date.ts` (aturan + hari transisi 28 jam), pengaturan `businessDayCutoffHour` (4) &
  `businessDayEffectiveDate` (kosong = kalender). PR #87 (B1) + B1b.
- **Tanggal efektif belum ditentukan Owner** — diisi setelah B1b selesai (field baru muncul di Pengaturan → Shift & Cash).
- Kebijakan global (satu outlet); per outlet menyusul bila outlet bertambah.

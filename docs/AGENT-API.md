# Garage OS — API Key Agent AI (OpenClaw / Hermes)

Agent AI seperti **OpenClaw** atau **Hermes** yang terhubung ke WhatsApp / Telegram bisa
mengendalikan Garage OS memakai **API key agent**. Garage OS tidak menjalankan bot WA/Telegram
sendiri — agent yang menerima pesan owner, lalu memanggil Garage OS lewat **MCP** atau **REST**.

## 1. Membuat key
1. Login sebagai **Owner** → Pengaturan → **Integrasi** → panel **API Key Agent AI** → **Buat key**.
2. Isi nama (mis. `OpenClaw WhatsApp`), hak akses, dan masa berlaku.
3. Salin key (`gk_agent_…`) — **hanya tampil sekali**. Simpan di pengaturan rahasia agent.
4. Bila bocor: tekan **Cabut** — key langsung tidak berlaku.

| Hak akses | Bisa apa |
|---|---|
| **Owner penuh** | Semua fitur, termasuk uang (void/refund, pengeluaran, harga). Aksi langsung jalan, **kecuali memutus pengajuan** (lihat di bawah). |
| **Manajer** | Seperti akun Manajer (tanpa pengaturan inti Owner). |
| **Baca-saja** | Hanya GET (lihat data & laporan). **Tidak bisa MCP** — pakai REST GET. |

> **Keputusan pengajuan (audit Smart Approval, Nov 2026 — keputusan Owner):** API key agent (semua scope) hanya boleh
> **membaca dan mengajukan**. Menyetujui/menolak/menunda pengajuan (`putuskan_approval`, `PATCH /api/approvals/{id}`,
> PIN, bulk) ditolak `403 AGENT_CANNOT_DECIDE` di server (`decisionPolicyBlock`, `smart-approval.ts`). Keputusan risiko
> tinggi (R3) hanya oleh Owner dengan kode 2FA (Decision Center, ChatGPT, atau AI Command layar Owner).

Agent bertindak atas nama Owner pembuat key. Semua aksi tercatat di **Audit** dengan nama
`<Owner> · Agent <nama key>` dan perangkat `agent:<nama key>`. Batas 120 permintaan/menit per key.

Key **tidak bisa** dipakai untuk: kelola API key, login/akun/2FA, provider AI, purge data,
cron/job & webhook, **kelola user/role/PIN/reset password/sesi** (`/api/admin/users`, `/api/admin/security`), dan
**pengaturan keamanan** (`security*`, termasuk kill switch MCP ChatGPT `mcpChatgptPaused`). Hal-hal itu hanya
lewat Owner yang login langsung (ada 2FA) — key statis tidak punya MFA.

Jejak Audit dicatat **sebelum** permintaan diproses untuk semua request yang mengubah data dan GET ke data
keuangan/laporan/payroll/kontrol (`/api/finance`, `/api/reports`, `/api/control`, `/api/payroll`, `/api/wallet-*`,
`/api/earnings`, `/api/owner`, `/api/hr`, `/api/approvals`, `/api/audit`). Bila audit gagal dicatat, permintaan ditolak
`503 AGENT_AUDIT_FAILED`.

## 2. Pasang di agent (MCP — disarankan)
- URL: `https://<domain-garage>/api/mcp` (Streamable HTTP, stateless)
- Header: `Authorization: Bearer gk_agent_…`

Contoh konfigurasi (format umum `mcpServers`; sesuaikan dengan menu MCP di OpenClaw/Hermes):

```json
{
  "mcpServers": {
    "garage-os": {
      "url": "https://garagecoffee.id/api/mcp",
      "headers": { "Authorization": "Bearer gk_agent_XXXX" }
    }
  }
}
```

Hermes (`config.yaml`) kurang lebih:

```yaml
mcp_servers:
  garage-os:
    url: https://garagecoffee.id/api/mcp
    headers:
      Authorization: Bearer gk_agent_XXXX
```

## 3. REST
| Endpoint | Fungsi |
|---|---|
| `GET /api/agent/v1/me` | Info key (scope, outlet, atas nama) |
| `GET /api/agent/v1/tools` | Daftar tool + JSON Schema argumen |
| `POST /api/agent/v1/tools/{tool}` | Jalankan tool, body = argumen JSON |
| `GET /api/agent/v1/tools/{tool}?args={json}` | Jalankan tool baca (untuk key baca-saja) |
| `GET /api/agent/v1/openapi.json` | Spesifikasi OpenAPI 3.1 |
| semua `/api/*` lain | Menerima `Authorization: Bearer gk_agent_…` sesuai hak key |

```bash
curl -H "Authorization: Bearer gk_agent_XXXX" https://garagecoffee.id/api/agent/v1/tools/ringkasan_hari_ini
curl -X POST -H "Authorization: Bearer gk_agent_XXXX" -H "Content-Type: application/json" \
  -d '{"modul":"pembelian","divisi":"bar","from":"2026-10-01","to":"2026-10-31","format":"pdf"}' \
  https://garagecoffee.id/api/agent/v1/tools/buat_laporan
```
Respons: `{ "data": … }` atau `{ "error": { "code", "message" } }`.

## 4. Tool
Setiap tool punya **domain** (16 domain PRD V4.0 §04) dan **risiko** (PRD §07.2): R0 baca · R1 ubah reversibel ·
R2 dampak finansial · R3 kritis. Di MCP, risiko & domain tampil di depan deskripsi, di `annotations`
(`readOnlyHint`, `destructiveHint` untuk R2/R3) dan `_meta` (`garage/risk`, `garage/domain`). Registry:
`src/lib/mcp-tool-registry.ts`; tool baru wajib mengisi keduanya (dijaga tes).

| Tool | Domain | Risiko | Isi |
|---|---|---|---|
| `ringkasan_hari_ini` | Dashboard | R0 | Omzet, transaksi, terlaris, metode bayar, antrean, stok menipis, peringatan |
| `status_operasional` | Bar/Kitchen | R0 | Antrean Bar/Dapur, siap antar, tepat waktu, peringatan |
| `laporan_penjualan` | Dashboard | R0 | Rentang tanggal: omzet, bersih, diskon, void/refund, per produk/kasir/metode/jam |
| `daftar_order` | POS | R0 | Order terbaru per status |
| `cek_stok_bahan` | Gudang | R0 | Cari bahan gudang (stok, minimum, HPP), opsi hanya menipis |
| `daftar_menu` / `ubah_status_menu` | Produk | R0 / R1 | Lihat menu; tandai habis / tersedia |
| `daftar_approval` / `putuskan_approval` | Keuangan | R0 / R3 | Pengajuan & keputusannya (tolak wajib alasan). Memutus hanya Owner lewat ChatGPT/AI Command (konfirmasi + kode 2FA); API key ditolak `AGENT_CANNOT_DECIDE` |
| `catat_pengeluaran` | Keuangan | R2 | Catat pengeluaran kas |
| `rekap_kas_harian` | Shift & Cash | R0 | Rekap shift kasir per tanggal |
| `pengawasan_kas` | Shift & Cash | R0 | Panel pengawasan kas Owner: saldo akun, antrean tindakan, pengecualian (Owner saja) |
| `daftar_kas_laci` / `putuskan_kas_laci` | Shift & Cash | R0 / R2 | Kas keluar/masuk laci; setujui/tolak pengajuan kasir (tolak wajib alasan) |
| `konfirmasi_setoran` | Shift & Cash | R2 | Setoran laci → rekening bank, wajib nomor bukti setor |
| `daftar_petty_cash` / `putuskan_petty_cash` | Shift & Cash | R0 / R2 | Petty cash: setujui, bayar (penerima), tolak/batal (alasan) |
| `verifikasi_shift` | Shift & Cash | R2 | Periksa shift yang ditutup; selisih wajib diakui + catatan |
| `status_closing_harian` / `tutup_buku_harian` | Keuangan | R0 / R3 | Cek closing harian lalu tutup buku (peringatan wajib diakui) |
| `riwayat_order` / `ubah_info_order` | POS | R0 / R1 | Riwayat perubahan order; ubah nama/telepon/catatan/meja (nominal tidak berubah, alasan wajib) |
| `batalkan_order` / `refund_order` | POS | R2 | Batal/refund lewat pengajuan APP-VOID / APP-RFD (Owner/Manajer = langsung disetujui) |
| `koreksi_metode_bayar` | POS | R2 | Ganti metode bayar salah input; total tetap, laci lewat buku kas |
| `daftar_staf` / `ubah_status_peran_staf` | Karyawan | R0 / R3 | Daftar staf; ubah peran / suspend (hanya ChatGPT login Owner, bukan API key; password & PIN tidak lewat chat) |
| `daftar_kategori_produk` | Produk & Harga | R0 | Kategori dinamis (id, stasiun, grup POS, jumlah produk) |
| `ubah_harga_varian` | Produk & Harga | R2 | Harga jual satu varian; wajib `hargaLama` (proteksi harga basi), alasan wajib; resep/HPP/SKU tetap |
| `aksi_produk` | Produk & Harga | R2 | Aktif/arsip, status stok, menu digital, pindah kategori, tipe produk (1–100 produk, audit per produk) |
| `daftar_minta_bahan` / `kirim_minta_bahan` | Gudang | R0 / R2 | Permintaan bahan Bar/Dapur; kirim = stok pindah gudang utama → ruang (FEFO) |
| `daftar_waste` / `putuskan_waste` | Gudang | R0 / R2 | Waste staf ≥ Rp50.000 diputuskan Owner/Manajer (disetujui = stok dipotong) |
| `saran_belanja` / `buat_po_dari_saran` | Gudang | R0 / R1 | Saran min–max; buat PO DRAFT per supplier |
| `daftar_po` / `ubah_status_po` | Gudang | R0 / R2 | PO; tandai terkirim / batalkan |
| `batch_hampir_kedaluwarsa` | Gudang | R0 | Batch kedaluwarsa dalam N hari |
| `cari_member` / `detail_member` | Member & CRM | R0 | Cari & profil member (Owner/Manajer saja) |
| `sesuaikan_poin_member` | Member & CRM | R2 | Tambah/kurangi poin dengan alasan (transaksi ADJUSTMENT, saldo ≥ 0) |
| `status_meja` / `pindah_meja` | Meja & QR | R0 / R1 | Status meja live; pindah semua bill + tiket + panggilan ke meja lain |
| `daftar_event` / `ringkasan_event` / `ubah_status_event` | Event | R0 / R1 | Event, tamu/RSVP, terbitkan/draft/arsip |
| `daftar_resep_draft` / `margin_menu` | Bahan & Resep | R0 | Resep usulan (bahan, HPP, food cost, baris bermasalah); margin menu |
| `setujui_resep_draft` / `tolak_resep_draft` | Bahan & Resep | R2 / R1 | Aktifkan resep usulan (mulai potong stok & HPP) / tolak dengan alasan (diarsipkan) |
| `ringkasan_marketing` / `daftar_promo` / `ubah_status_promo` | Marketing | R0 / R2 | Ringkasan marketing; promo/voucher; aktifkan/jeda promo |
| `daftar_konten` / `putuskan_konten` | Marketing | R0 / R1 | Antrean konten; setujui/tolak/revisi (Owner) |
| `terbitkan_konten` | Marketing | R3 | Posting konten approved ke media sosial (publik, tidak bisa ditarik dari OS) |
| `kirim_notifikasi_staf` | Notifikasi | R1 | Pengumuman ke staf di lonceng Garage OS (bukan WA/email) |
| `buat_laporan` | Dokumen | R0 | File PDF/XLSX/CSV (base64) — Penjualan, Pembelian Bar/Kitchen, Stok, Produksi, Keuangan |
| `kemampuan_sistem` | Sistem | R0 | Peta 16 domain: tool & risiko per domain, domain yang belum punya tool, hal yang selalu ditolak (R4) |
| `garage_api` | Sistem | R0 | Baca saja (GET) endpoint `/api` yang belum punya tool; ubah data wajib lewat tool bisnis (D-10). Tidak tersedia di MCP ChatGPT |

## 5. Keamanan
- Wajib HTTPS publik (`GARAGE_PUBLIC_BASE_URL` di server). Jangan kirim key lewat chat.
- Pakai key terpisah per agent; pilih masa berlaku; cabut yang tidak dipakai.
- Setiap `tools/call` di `/api/mcp` dicatat per tool di Audit (`Agent MCP tool <nama>`: risiko, key,
  argumen ringkas) **sebelum** dijalankan; bila audit gagal tercatat, tool tidak dijalankan.
- `garage_api` memanggil server sendiri lewat `GARAGE_INTERNAL_BASE_URL`
  (default `http://127.0.0.1:$PORT`).
- Rate limit persisten (tabel `rate_limit_counters`, migration 0165): 120/menit per API key,
  60/menit per akun Owner di `/api/mcp/chatgpt`. Tidak ter-reset saat restart dan berlaku
  lintas proses. Lewat batas → 429 (`AGENT_RATE_LIMITED` / JSON-RPC `RATE_LIMITED`).

## 6. ChatGPT (MCP + OAuth) — satu pintu kendali Owner

Keputusan Owner **D-01** (`docs/master-2026/06-OWNER-DECISIONS.md`): ChatGPT terhubung ke Garage OS lewat
**OAuth 2.1** (bukan API key `gk_agent_`). Endpoint: `https://garagecoffee.id/api/mcp/chatgpt`.

### Mengaktifkan (Owner / operator VPS — tidak dilakukan otomatis)
1. Pastikan migration `0163_mcp_oauth` sudah jalan (otomatis saat deploy).
2. Di `.env.production` VPS tambahkan:
   ```
   GARAGE_MCP_CHATGPT_ENABLED=true
   # BETTER_AUTH_URL wajib HTTPS, mis. https://garagecoffee.id
   # Opsional: alamat internal app untuk mengambil JWKS (default http://127.0.0.1:$PORT)
   # GARAGE_INTERNAL_BASE_URL=http://127.0.0.1:3001
   ```
   lalu restart app (butuh persetujuan Owner — perubahan env produksi).
3. Akun Owner **wajib 2FA aktif** (`/control/2fa`). Tanpa 2FA, consent & panggilan MCP ditolak.

Selama `GARAGE_MCP_CHATGPT_ENABLED` bukan `true`: tidak ada endpoint OAuth, `/.well-known/*` dan
`/api/mcp/chatgpt` membalas 404 — perilaku produksi sama seperti sebelum fitur ini.

### Menghubungkan di ChatGPT
1. ChatGPT (web) → Settings → Connectors / Apps → tambah custom MCP server.
2. URL: `https://garagecoffee.id/api/mcp/chatgpt`, autentikasi **OAuth** (ChatGPT mendaftarkan diri otomatis
   lewat Dynamic Client Registration).
3. Login Owner → kode 2FA → halaman **Hubungkan aplikasi AI** → **Izinkan**.

### Kontrol & keamanan
- Hanya **Owner aktif + 2FA**. Akun lain yang berhasil login tetap ditolak `OWNER_ONLY` di setiap panggilan.
- Token akses 15 menit (refresh 7 hari), terikat resource `/api/mcp/chatgpt` (audience), scope `garage:owner`.
- **Kill switch tanpa restart:** Pengaturan → Keamanan → *Jeda koneksi ChatGPT (MCP)* → semua panggilan 503.
- Setiap `tools/call` dicatat di Audit **sebelum** dijalankan (`device = mcp:chatgpt`, `metadata.source = chatgpt`);
  bila audit gagal, tool tidak dijalankan.
- Tool sama dengan MCP agent (`/api/mcp`), **ditambah tulis universal** (Owner, Okt 2026: "semua hal di Garage boleh
  saya ubah lewat ChatGPT"):
  - `garage_api` (GET) membaca endpoint mana pun; `katalog_endpoint` mendaftar endpoint & method (hasil generate
    `scripts/generate-api-catalog.ts` → `src/lib/api-route-catalog.generated.ts`, tes menjaga sinkron).
  - `ubah_data_garage` (R2, `confirmOnly`; path UANG = R3 → wajib `kode2fa`, lihat `isMoneyPath`): POST/PUT/PATCH/DELETE ke `/api/*` atas nama Owner, **selalu** lewat
    preview → konfirmasi. Hanya ada di pintu ChatGPT; REST agent & `/api/mcp` (key statis) tidak melihatnya.
  - Token OAuth tidak pernah diteruskan: setiap panggilan memakai API key agent **sementara** (scope owner untuk
    ubah, readonly untuk baca/preview; 2 menit; label `ChatGPT·op …`) yang langsung dicabut
    (`mcp-delegated-api.ts`), jadi audit per request, path terlarang agent, `requireHumanSession`, setting
    terlindungi, Zod & aturan bisnis route tetap berlaku. Key ini tidak tampil di Pengaturan → Integrasi.
  - Ditolak (`ubahDataBlockReason`): auth/API key/akun & keamanan pengguna, PIN/password, tutup/buka buku
    (pakai `tutup_buku_harian`), sertifikasi saldo awal, terbitkan konten (pakai `terbitkan_konten`), aksi
    massal/impor, endpoint sisi pelanggan/member, backup, OAuth.
- **Unggah foto dari chat** (Owner, 17 Nov 2026) — dua langkah, hanya di pintu ChatGPT:
  1. `siapkan_foto` (R1): Owner mengunggah foto di percakapan; ChatGPT mengisi argumen `foto` (file, lewat
     `_meta["openai/fileParams"]`). Server mengunduh **hanya** dari host unggahan ChatGPT (https, tanpa IP,
     redirect dicek ulang), maks 8 MB, isi wajib JPG/PNG/WebP asli, lalu di-encode ulang (EXIF dibuang) dan
     disimpan sementara 30 menit (non-publik, terikat Owner). Belum mengubah data; balasannya `fotoId`.
  2. `pasang_foto` (R2, preview → konfirmasi): pasang `fotoId` ke tujuan tetap — `produk_menu` (cukup `nama` produk,
     mis. "Nasi Goreng": nama persis menang, nama ambigu → `PRODUK_AMBIGU` + daftar pilihan; atau `id`),
     `produk_mitra` (`nama` produk mitra atau id link; produk mitra yang disebut lewat `produk_menu` otomatis ke
     endpoint foto mitra; hanya mitra outlet sendiri), `bahan_gudang` (id), `hero_website`, `suasana_website`
     (slot 1–4). Diteruskan ke endpoint unggah yang sudah ada (kompresi & audit route itu tetap jalan).
  - Bukti uang (struk kas, bukti transfer, dokumen) tidak bisa lewat jalur ini. URL unduhan tidak pernah
    masuk audit/log. Host tambahan (bila OpenAI mengganti domain file): env `GARAGE_MCP_PHOTO_HOSTS`
    (dipisah koma) — hanya operator VPS.
  - Menghapus foto suasana: `ubah_data_garage` DELETE `/api/site/landing-hero?slot=suasana_N`.
- **Cukup nama** (Owner, 18 Nov 2026) — tool khusus supaya ChatGPT tidak menebak id/endpoint:
  - Produk: `buat_produk` (R2: nama + kategori + harga/varian, SKU otomatis), `ubah_harga_produk` (R2: nama + varian).
  - Mitra: `daftar_mitra`, `produk_mitra`, `pesanan_mitra`, `usulan_harga_mitra` (R0); `tambah_produk_mitra` (R2, produk
    masuk nonaktif), `setujui_produk_mitra`, `ubah_harga_mitra`, `putuskan_usulan_harga_mitra` (R2, Owner),
    `ubah_status_mitra` (R2). Settlement/pembayaran mitra tidak ada di chat.
  - Event (Owner): `papan_event` (R0), `simpan_talent` / `simpan_panitia` / `simpan_tugas_panitia` (R1, cocok dari nama:
    ada = ubah, belum = tambah), `tempel_daftar_event` (R2, teks Excel/WA; satu baris salah = tidak ada yang disimpan),
    `simpan_sponsor` (R2, kesepakatan saja — tanpa buku kas). Event kosong = event terdekat.
  - `briefing_pagi` (R0): merangkum `ringkasan_hari_ini`, `laporan_penjualan` kemarin, `status_closing_harian`,
    `daftar_approval`, `cek_stok_bahan`, `pesanan_mitra`, `usulan_harga_mitra`, `papan_event`; bagian gagal = keterangan.
  - Penolakan aturan bisnis dari service (`code` HURUF_BESAR + status 4xx, mis. `PRICE_BELOW_COST`) kini diteruskan ke
    ChatGPT apa adanya (`domainRejection` di `agent-mcp.ts`); error lain tetap `EXECUTION_FAILED` + ref.
- **Sakelar Owner:** Pengaturan → Keamanan → *ChatGPT boleh mengubah data* (`mcpChatgptWriteEnabled`, default
  hidup). Mati = semua tool yang mengubah data ditolak `MCP_WRITE_DISABLED`; membaca tetap jalan. Tidak bisa
  diubah lewat API key/ChatGPT (prefix `mcpChatgpt` terlindungi).
- Di ChatGPT, tool yang mengubah data hanya dipakai bila connector dipasang lewat **Developer mode**; setelah
  server di-update, refresh connector supaya daftar tool baru terbaca.
- **Aksi R2/R3 = preview → konfirmasi → eksekusi → receipt** (batch M2, PRD §07.4–07.5):
  1. Panggilan pertama tanpa `konfirmasi` **tidak dijalankan**; server membalas `status: PERLU_KONFIRMASI`,
     ringkasan dampak (mis. nominal, sumber dana), `operasiId` dan token `konfirmasi` (sekali pakai, 5 menit).
  2. ChatGPT menunjukkan ringkasan ke Owner; bila Owner setuju, memanggil tool yang sama dengan argumen **sama persis**
     + `konfirmasi`. Argumen berubah → `CONFIRMATION_ARGS_CHANGED`; token dipakai ulang → `CONFIRMATION_USED`;
     lewat 5 menit → `CONFIRMATION_EXPIRED`.
  3. Hasil `status: BERHASIL` + `receipt` (operasiId, waktu). Tool `status_operasi` menampilkan PENDING / EXECUTED /
     FAILED / UNKNOWN (terputus — jangan dianggap berhasil). Tabel `mcp_operations` (migration 0164); token tidak
     pernah disimpan atau masuk audit (hanya hash nonce).
  Key statis `gk_agent_` (`/api/mcp`, REST) belum memakai alur ini — perilakunya tidak berubah.
- **Aksi R3 butuh kode 2FA (D-01a):** preview R3 berisi `butuhKode2fa: true`. Panggilan konfirmasi wajib
  `konfirmasi` **dan** `kode2fa` (6 angka yang diketik Owner dari aplikasi authenticator — ChatGPT tidak boleh
  menebak). Tanpa kode → `KODE_2FA_WAJIB`; kode salah → `INVALID_CODE` (token tetap berlaku sampai 5 menit);
  kode dipakai ulang → `CODE_REUSED`; argumen berubah → `CONFIRMATION_ARGS_CHANGED`. Kode diverifikasi sebelum
  token diklaim dan tidak pernah dicatat.
- Discovery: `/.well-known/oauth-protected-resource[/api/mcp/chatgpt]`,
  `/.well-known/oauth-authorization-server[/api/auth]`, consent di `/oauth/consent`.

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
| **Owner penuh** | Semua fitur, termasuk uang (void/refund, pengeluaran, approval, harga). Aksi langsung jalan. |
| **Manajer** | Seperti akun Manajer (tanpa pengaturan inti Owner). |
| **Baca-saja** | Hanya GET (lihat data & laporan). **Tidak bisa MCP** — pakai REST GET. |

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
| Tool | Isi |
|---|---|
| `ringkasan_hari_ini` | Omzet, transaksi, terlaris, metode bayar, antrean, stok menipis, peringatan |
| `status_operasional` | Antrean Bar/Dapur, siap antar, tepat waktu, peringatan |
| `laporan_penjualan` | Rentang tanggal: omzet, bersih, diskon, void/refund, per produk/kasir/metode/jam |
| `daftar_order` | Order terbaru per status |
| `cek_stok_bahan` | Cari bahan gudang (stok, minimum, HPP), opsi hanya menipis |
| `daftar_menu` / `ubah_status_menu` | Lihat menu; tandai habis / tersedia |
| `daftar_approval` / `putuskan_approval` | Pengajuan & keputusannya (tolak wajib alasan) |
| `catat_pengeluaran` | Catat pengeluaran kas |
| `rekap_kas_harian` | Rekap shift kasir per tanggal |
| `buat_laporan` | File PDF/XLSX/CSV (base64) — Penjualan, Pembelian Bar/Kitchen, Stok, Produksi, Keuangan |
| `garage_api` | Akses penuh: panggil endpoint `/api` mana pun (method, path, query, body) |

## 5. Keamanan
- Wajib HTTPS publik (`GARAGE_PUBLIC_BASE_URL` di server). Jangan kirim key lewat chat.
- Pakai key terpisah per agent; pilih masa berlaku; cabut yang tidak dipakai.
- `garage_api` memanggil server sendiri lewat `GARAGE_INTERNAL_BASE_URL`
  (default `http://127.0.0.1:$PORT`).

# GARAGE AI — Konsep Final (Siap Dipakai Operasional)

Dokumen ini adalah versi final konsep GARAGE AI untuk Garage Coffee & Motor OS: apa yang sudah jalan, batasan aman, dan cara pakai di outlet.

## 1. Prinsip Final

GARAGE AI bukan autopilot yang mengubah transaksi sendiri. Perannya:

| Peran AI | Manusia |
| --- | --- |
| Memantau QR, kitchen, stok, finance, approval | Memutuskan void/refund/closing |
| Membuat alert & draft per role | Menyetujui aksi kritis |
| Menjawab pertanyaan (CEO Brain / POS Agent) | Menjalankan tindakan di lapangan |

Mode autonomy default: **controlled** — aman untuk outlet F&B.

## 2. Tiga Lapisan yang Sudah Aktif

### Lapisan A — Staff Supervision Copilot (otomatis)

Job **Staff Supervision** (endpoint `shift-copilot`) membaca data live dan mendeteksi **kesalahan karyawan** tanpa owner mengetik:

- QR pending / SLA → **Kesalahan** ke Kasir/Waiter (+ Supervisor bila parah)
- Pembayaran tertunda / banyak penolakan QR → **Perlu dibenahi** / **Pengingat SOP** floor
- Kitchen delay → **Kesalahan** kitchen (+ Supervisor)
- Stok kritis/watch → **Perlu dibenahi** / coaching gudang
- Approval menumpuk / stale → **Perlu dibenahi** management
- Audit warning per aktor → supervisor review
- Finance guard (kas, settlement) → finance + kasir
- Shift gate WATCH → briefing supervisor

**Cara jalan:**

| Environment | Cara aktifkan |
| --- | --- |
| Vercel production | Cron `*/10 * * * *` → `GET /api/ai/jobs/shift-copilot` |
| PC LAN / dev | `npm run ai:shift-copilot` atau Task Scheduler + Bearer secret |
| Browser (Owner/Admin/Manager/Supervisor) | Auto-trigger saat buka app jika data > 15 menit; atau tombol di bell alerts |

### Lapisan B — Inbox Alert Karyawan (in-app)

Semua staf login melihat **ikon bell GARAGE AI** di header OS dan POS:

- `GET /api/ai/alerts` — filter otomatis sesuai role
- `POST /api/ai/alerts/[id]/ack` — tandai “Sudah ditangani”
- Poll tiap 45 detik
- Suara TTS untuk alert **priority high** baru

Ini adalah saluran “mengingatkan karyawan” di dalam Garage OS (tanpa WhatsApp dulu).

### Lapisan C — Chat & CEO Brain (manual + provider AI)

Tetap seperti sebelumnya:

- POS Agent / quick prompt (Shift Copilot, Inventory, Kitchen, Finance, dll.)
- CEO Brain khusus Owner
- Provider AI wajib **Simpan & Connect** → status ready
- Master report harian, System Doctor, log cleanup via cron

## 3. Setup Wajib (Checklist)

```env
DATABASE_URL=...
OPENAI_API_KEY=sk-...          # atau provider lain di UI
AI_CONFIG_ENCRYPTION_KEY=...   # min 32 karakter
GARAGE_JOB_SECRET=...          # untuk cron / CLI job
```

Langkah UI:

1. Login Owner/Admin → modul **GARAGE AI**
2. **Provider AI** → isi key → Simpan & Connect → **ready**
3. **Setup Center** → semua hijau (provider, encryption, cron, database)
4. Klik **Jalankan Shift Copilot** (tes manual)
5. Buka **bell alerts** di header → harus muncul alert jika ada sinyal (QR pending, stok low, dll.)

## 4. API Baru

| Endpoint | Auth | Fungsi |
| --- | --- | --- |
| `GET /api/ai/jobs/shift-copilot` | Bearer job secret | Cron autopilot |
| `POST /api/ai/shift-copilot/run` | Owner, Admin, Manager, Supervisor | Manual run |
| `GET /api/ai/alerts` | Semua role staf | Daftar alert untuk role |
| `POST /api/ai/alerts/[id]/ack` | Semua role staf | Ack alert |

## 5. Cron Lengkap (`vercel.json`)

| Job | Jadwal | Fungsi |
| --- | --- | --- |
| master-report | 23:55 WIB | Laporan harian Excel |
| log-cleanup | tiap 3 hari | Bersihkan log AI |
| system-doctor | tiap 30 menit | Health provider/DB |
| **shift-copilot** | **tiap 10 menit** | **Alert operasional per role** |

## 6. LAN Outlet (Tanpa Vercel Cron)

```powershell
# Sekali tes
npm run ai:shift-copilot

# Atau HTTP dengan secret
$secret = $env:GARAGE_JOB_SECRET
Invoke-WebRequest -Uri "http://127.0.0.1:3001/api/ai/jobs/shift-copilot" -Headers @{ Authorization = "Bearer $secret" }
```

Jadwalkan Task Scheduler Windows tiap 10 menit saat jam operasional.

## 7. Batasan yang Masih Berlaku (Sengaja)

- AI **tidak** mengeksekusi void, refund, closing kas, ubah harga, atau PO final
- Approve action draft hanya mengubah status DB, bukan eksekusi bisnis
- Belum ada push WhatsApp ke HP karyawan (fase berikutnya)
- Chat LLM tetap butuh provider ready; autopilot alert **tidak** butuh LLM (rules engine)

## 8. Pengaturan GARAGE AI (Modul Pengaturan → tab GARAGE AI)

| Field | Fungsi |
| --- | --- |
| Autopilot Shift Copilot | On/off scan otomatis |
| Jam mulai / selesai (WIB) | Autopilot hanya jalan di jam operasional outlet |
| WhatsApp alert high | Buat link `wa.me` untuk alert prioritas tinggi |
| Template pesan | `{brand}`, `{title}`, `{detail}`, `{priority}`, `{role}` |
| HP per grup | Kasir/Waiter, Kitchen, Gudang, Management — pisah koma |

Cara pakai WhatsApp:

1. Isi nomor HP per grup di Pengaturan.
2. Saat alert **high** muncul, staf buka bell → tombol **WA 08...**
3. WhatsApp terbuka dengan pesan sudah terisi; kirim manual.
4. Tidak memakai WhatsApp Business API (aman untuk MVP).

## 9. Roadmap Setelah Final Ini

1. Executor terbatas untuk aksi `safe` (bukan critical)
2. Optional LLM enrichment di atas rules engine (hemat token)
3. WhatsApp Business API (jika owner minta kirim otomatis tanpa klik)

## 10. Definisi “Siap Dipakai”

GARAGE AI dinyatakan siap operasional jika:

- [ ] Provider ready + encryption + cron secret terisi
- [ ] `npm run ai:shift-copilot` sukses (created > 0 saat ada sinyal)
- [ ] Bell alerts tampil di POS/Kitchen/Kasir sesuai role
- [ ] Kasir ack alert QR pending
- [ ] Owner bisa chat CEO Brain / Shift Copilot manual
- [ ] Cron shift-copilot jalan di production atau Task Scheduler LAN

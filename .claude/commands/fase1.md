---
description: FASE 1 — Audit Development Maksimal per modul (Garage OS)
argument-hint: "[nama modul, kosongkan untuk audit semua]"
---

# FASE 1 — Development Maksimal Audit

Kamu **WAJIB masuk planning mode** (jangan edit/tulis file). Tugas: audit kesiapan **development** Garage OS sesuai checklist + struktur aplikasi.

## Sumber acuan (WAJIB dibaca semua)

@GARAGE_OS_CHECKLIST_FINAL_MAKSIMAL.md
@STRUKTUR APLIKASI.MD
@POLA_KERJA_AI_AGENT.md
@CLAUDE.md

## Argumen
Target modul: **$ARGUMENTS** (jika kosong → audit seluruh 20 modul).

## Cara Kerja (URUT, tidak boleh diloncat)

### Langkah 1 — Pemetaan
1. Dari `STRUKTUR APLIKASI.MD`, ambil daftar modul + path file/folder yang relevan.
2. Dari `GARAGE_OS_CHECKLIST_FINAL_MAKSIMAL.md`, ambil **checklist per modul** (section 7–29) + **Definition of Done** (section 38).
3. Cocokkan: setiap modul di struktur → punya checklist mana?

### Langkah 2 — Verifikasi di Codebase
Untuk tiap modul yang diaudit, lakukan **read file langsung** (bukan asumsi):
- Cek file UI di `src/components/garage/...`
- Cek API di `src/app/api/...`
- Cek schema di `src/db/schema.ts`
- Cek service di `src/lib/...`
- Cek route di `src/app/...`

Untuk tiap item checklist, tandai:
- ✅ **DONE** — file/logic ada + lulus DoD
- 🟡 **PARTIAL** — ada tapi belum lengkap (sebut yang kurang)
- ❌ **MISSING** — belum ada
- ⚠️ **RISK** — ada tapi melanggar aturan (mis. tanpa Zod, tanpa permission, tanpa audit log)

### Langkah 3 — Build Safety Check
Cek (tanpa menjalankan, baca config saja):
- `package.json` scripts: `db:generate`, `lint`, `build`, `db:migrate`, `db:seed`
- `next.config.ts`
- `drizzle.config.ts`
- Apakah ada query DB di top-level import? (cek `src/db/index.ts`)

### Langkah 4 — Laporan Planning Mode

Format laporan (markdown, ringkas, tabel bila perlu):

```
# FASE 1 — Audit Report

## Ringkasan
- Total modul diaudit: N
- ✅ DONE: x  |  🟡 PARTIAL: y  |  ❌ MISSING: z  |  ⚠️ RISK: w

## Per Modul
### Modul: <nama>
| Item Checklist | Status | Lokasi File | Catatan |
|---|---|---|---|
| ... | ✅ | src/.../foo.tsx | — |
| ... | 🟡 | src/.../bar.ts | Belum ada Zod |
| ... | ❌ | — | Schema belum ada |

## Blocker Kritis (harus diselesaikan dulu)
1. ...
2. ...

## Rekomendasi Urutan Kerja Berikutnya
Berdasarkan section 40 (Prioritas Eksekusi) di checklist:
1. ...
2. ...

## Build Safety
- next build → [diperkirakan lulus / ada risiko: ...]
- lint → [...]
- Tidak ada query DB di import top-level: [ya/tidak]

## Go/No-Go ke FASE 2
[ ] Semua MVP (section 35) ✅
[ ] Semua Master Pro (section 36) ✅ (opsional jika hanya MVP)
[ ] Tidak ada ❌ kritis di modul utama (POS, Kitchen, Finance, Audit)
[ ] Build aman

Keputusan: **GO / NO-GO ke FASE 2**
```

## Aturan
- **JANGAN edit file apapun** — ini mode audit/planning.
- **JANGAN asumsi** — kalau ragu, baca file aslinya.
- **JANGAN spawn agent** — kerjakan sendiri agar konteks tidak tercecer.
- Pakai bahasa Indonesia.
- Output harus actionable: setiap ❌/🟡 ada **path file** dan **langkah perbaikan**.

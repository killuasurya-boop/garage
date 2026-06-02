---
description: Shortcut audit Garage OS — pilih fase 1/2/3 atau semua
argument-hint: "[1 | 2 | 3 | all] [modul opsional]"
---

# Garage OS — Audit Checklist Router

Planning mode. Routing ke fase audit yang sesuai.

## Sumber

@GARAGE_OS_CHECKLIST_FINAL_MAKSIMAL.md
@STRUKTUR APLIKASI.MD
@POLA_KERJA_AI_AGENT.md
@panduan_deploy_aplikasi_mvp_ke_vps.md
@CLAUDE.md

## Argumen
Input: **$ARGUMENTS**

## Routing

- `$ARGUMENTS` mulai dengan `1` → jalankan logika `/fase1` (Development Audit). Sisa argumen = nama modul.
- `$ARGUMENTS` mulai dengan `2` → jalankan logika `/fase2` (Readiness Audit). Sisa argumen = scope.
- `$ARGUMENTS` mulai dengan `3` → jalankan logika `/fase3` (Pre-Deploy Audit). Sisa argumen = scope.
- `$ARGUMENTS` = `all` atau kosong → jalankan **3 fase berurutan**:
  1. Mulai dari `/fase1` (semua modul)
  2. Hanya lanjut ke `/fase2` jika fase 1 GO
  3. Hanya lanjut ke `/fase3` jika fase 2 GO
  4. Laporan akhir gabungan + keputusan deploy

## Aturan
- **Tidak boleh skip fase**. Jika fase sebelumnya NO-GO → STOP, laporkan blocker, tidak lanjut.
- Mode planning — **tidak edit file**.
- Output akhir: ringkasan + keputusan + langkah berikutnya.
- Bahasa Indonesia.

## Format Output Mode "all"

```
# Garage OS — Full Audit Report

## FASE 1: Development
[ringkasan + GO/NO-GO]

## FASE 2: Readiness
[ringkasan jika lanjut, atau "SKIPPED — Fase 1 NO-GO"]

## FASE 3: Pre-Deploy
[ringkasan jika lanjut, atau "SKIPPED"]

## Keputusan Final
- Status: [LANJUT KE DEPLOY / PERBAIKI FASE X]
- Blocker utama: ...
- Langkah berikutnya: ...
```

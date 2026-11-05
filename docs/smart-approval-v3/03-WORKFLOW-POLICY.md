# Smart Approval V3 — 03 Workflow & Kebijakan Keputusan

Alur: Pengajuan → Validasi (server) → Pemeriksaan bukti (snapshot) → Analisis risiko (tier) → Rekomendasi AYA (aturan) →
Review (Tunda/Minta revisi) → Keputusan berwenang → Pelaksanaan resmi → Verifikasi (status tercatat) → Dokumentasi (audit).

| Tier | Contoh | Aturan |
|---|---|---|
| R1 | lainnya, risiko rendah | boleh massal |
| R2 | pengeluaran sedang, diskon, stok sedang | boleh diputus satu per satu; massal hanya non-void/refund/kas/stok |
| R3 | refund/void/selisih kas/pengeluaran/diskon/opname **risiko tinggi** | tidak pernah otomatis/massal; di Decision Center wajib TOTP Owner |

- **Disetujui ≠ berhasil**: `status` = keputusan, `execution_status` = hasil (`running`, `succeeded`, `failed`, `not_required`, `legacy`).
- Data berubah sejak dilihat → `STALE` (409); tantangan 2FA terikat sidik yang sama.
- Auto-approval: hanya pengeluaran risiko rendah/sedang < batas Owner, pemohon tercatat ≠ penjalan, maks 3/hari/pemohon, outlet sendiri.
- Manajer: hanya outletnya; Owner: semua. Pengajuan lama tanpa outlet tetap bisa diputus.
- Tolak/Tunda/Minta revisi wajib catatan ≥ 5 karakter. Tunda/Revisi tidak mengubah uang/stok.
- AYA tidak pernah memutus: rekomendasi berbasis aturan + "Tanya AYA" (saran, konteks tanpa nama pemohon).

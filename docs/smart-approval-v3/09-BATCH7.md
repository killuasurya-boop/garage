# Smart Approval V3 — 09 Batch 7 (Document Approval, AI Governance, PDF keputusan, A8)

Tanggal: 6 Nov 2026 · branch `ccr-29608758-dtli1n` · migrasi **0179_document_approval** (belum di produksi).

## 1. A8 — pemohon PCX disimpan sebagai ID
- Sebelumnya `payload.requestedBy` APP-PCX berisi nama ("Nama / Peran"), sedangkan cek "bukan pengajuan sendiri"
  membandingkan ID user → Manajer bisa menyetujui batal-item yang ia ajukan sendiri.
- Sekarang: `requestedBy` = ID user, `requestedByName` = nama tampilan. Cek juga mencocokkan baris lama (nama).
- Jalur internal `via: "langsung"` (pengaju yang berwenang memutus saat membuat) tetap boleh; nilai `via` tidak bisa
  dikirim dari request.
- Tes: `smart-approval.integration.test.ts` (A8), `production-cancel.integration.test.ts`.

## 2. Document Approval (APP-DOC)
| Langkah | Perilaku |
|---|---|
| Unggah versi | `company_document_versions.review_status = pending`, `sha256` file, pengajuan `APP-DOC-<versionId>` (risiko rendah, R1) dalam satu transaksi. Versi berlaku belum berubah. |
| Setujui (Owner) | Versi `approved`, `company_documents.approved_version` = versi ini. Pelaksanaan tercatat `succeeded`. |
| Tolak (Owner) | Versi `rejected` + catatan; versi berlaku lama tetap; file tidak dihapus. |
| Manajer | Tidak melihat APP-DOC di daftar/statistik, tidak bisa memutus atau menunda (dokumen = hak `company:manage`, Owner). |
| STALE | Sidik data mencakup dokumen & versi; bila versi lain diputus sejak Owner membuka → 409 STALE. |
| Decision Center | Penjelasan berbasis aturan (isi dokumen TIDAK dinilai otomatis), tautan "Unduh & baca vN". |

Migrasi 0179: kolom baru di `company_document_versions` (`review_status`, `sha256`, `reviewed_by`, `reviewed_at`,
`review_note`) dan `company_documents.approved_version`. Versi lama → `legacy`; `approved_version = current_version`
(dokumen yang ada tetap berlaku). Tidak ada data yang dihapus.

## 3. AI Governance (`/control/ai-governance`)
- Owner dari layar saja (agent key ditolak; path di `isAgentForbiddenPath`).
- Mode: **Dijeda** / **Baca saja** / **Eksekusi terkendali** = dua saklar yang sudah ada (`mcpChatgptPaused`,
  `mcpChatgptWriteEnabled`). Membuka "Eksekusi terkendali" butuh konfirmasi kedua. "Dijeda" juga mematikan tulis.
- Batas risiko R0–R3 per domain dibaca dari registry kode — tidak ada tombol untuk mengubahnya. Aturan tetap & R4 ditampilkan.
- Operasi R2/R3 30 hari: `confirmed` tanpa hasil = **Tidak pasti** (bukan berhasil); `pending` lewat masa = kedaluwarsa.
- Monitoring kasus AYA: efektivitas = kasus terverifikasi *membaik* ÷ kasus yang **sudah diukur ulang**.
- Pengetatan: saklar `mcpChatgpt*` dan `securityRequire2faForOwner` hanya bisa diubah Owner (Manajer tetap bisa
  setelan sesi/lockout). `ubah_data_garage` menolak key AI/keamanan sejak preview (key agent sudah ditolak di server).

## 4. PDF keputusan
- `GET /api/control/decision-center/[id]/pdf` (Owner). Isi A–J, keputusan & pelaksanaan sebagai field terpisah,
  timeline audit, sidik data sumber.
- Watermark DRAFT sampai diputus **dan** pelaksanaan tercatat (disetujui ≠ berhasil).
- Mencetak tidak membuat tantangan 2FA.

## 5. Tes
| Suite | Jumlah |
|---|---|
| `document-approval.integration.test.ts` | 5 |
| `ai-governance.test.ts` | 4 |
| `ai-governance.integration.test.ts` | 3 |
| `decision-pdf.integration.test.ts` | 2 |
| `agent-tools-ubah-data.test.ts` (tambahan Batch 7) | 2 |
| `smart-approval.integration.test.ts` (A8) | 1 |
| E2E `e2e/ai-governance.spec.ts` | 1 |

## 6. Rollback
- Kode: revert commit Batch 7. Migrasi 0179 aditif; kolom boleh dibiarkan.
- Bila perlu menonaktifkan Document Approval tanpa revert: setujui semua APP-DOC yang menunggu (Owner), lalu revert kode
  upload. Jangan hapus baris `company_document_versions`.

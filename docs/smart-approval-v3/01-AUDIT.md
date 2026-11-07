# Smart Approval V3 — 01 Audit Sistem Lama & Temuan

Tanggal: 6 Nov 2026 · Branch `ccr-29608758-dtli1n` (main `bec5f34` + PR #176) · DB uji PGlite, bukan produksi.

## Cakupan yang diperiksa
- Service: `decideApproval`, `applyApprovalDecision`, `decideApprovalWithPin`, `decideApprovalsBulk`, `runAutoApprovalSweep`,
  `getApprovalData`, `getApprovalStats` (`src/lib/garage-service.ts`), `src/lib/approval-rules.ts`, `cash-final-approval.ts`.
- API: `/api/approvals` (GET), `/api/approvals/[id]` (GET/PATCH), `/bulk`, `/auto-sweep`, `/stats`, `/discount-request`.
- Pembuat pengajuan: diskon manual (`APP-DISC`), opname lama (`APP-OPN`), void (`APP-VOID`), refund (`APP-RFD`),
  batal item belum bayar (`APP-PCX`), pengeluaran (`APP-EXP`), selisih kas (`APP-CASH`), ProfitMax (`PMX`).
- Skema `approvals` (`src/db/schema.ts`), tes integrasi yang ada (void/refund, opname, finance closing, production cancel, kasir e2e).

## Temuan
| # | Prioritas | Temuan | Bukti | Status |
|---|---|---|---|---|
| A1 | P0 | Setuju massal tidak membatasi risiko/jenis: refund/void/selisih kas risiko tinggi ikut disetujui sekaligus | `decideApprovalsBulk` hanya memanggil `decideApproval` per id | ✅ Diperbaiki (server menolak R3 + void/refund/selisih kas/stok) |
| A2 | P0 | Auto-approval pengeluaran hanya melihat nominal hasil parse teks; abaikan risiko, pemohon, outlet, frekuensi | `runAutoApprovalSweep` | ✅ Diperbaiki (`autoApprovalDecision`) |
| A3 | P0 | Keputusan & pelaksanaan menyatu: gagal → kembali "Menunggu" tanpa jejak; langkah berlapis `APP-PCX` (pisah bill → void) bisa memisah bill dua kali bila void gagal lalu diulang | `decideApproval`, `applyApprovalDecision` | ✅ Diperbaiki (`execution_status`, alasan, percobaan, audit; `splitChildId` idempoten; void dilewati bila sudah voided) |
| A4 | P0 | Pelaksanaan memakai data yang dibaca sebelum klaim; tidak ada pengecekan data berubah sejak dilihat | `current` dibaca sebelum update | ✅ Diperbaiki (sidik `approvalSubjectSnapshot`, `expectedSnapshotHash` → 409 `STALE`) |
| A5 | P1 | Tabel `approvals` tanpa outlet → Manajer melihat & memutus pengajuan outlet lain | skema, `getApprovalData` tanpa filter | ✅ Diperbaiki (`outlet_id`, filter daftar, cek keputusan, sweep) |
| A6 | P1 | Nominal hanya label teks | `amount text` | ✅ `amount_value` + backfill |
| A7 | P1 | Tidak ada Tunda / Minta revisi | — | ✅ `review_state` + `POST /api/approvals/[id]/review` |
| A8 | P2 | `APP-PCX.requestedBy` berisi nama (bukan user id) sehingga cek "tidak boleh setujui sendiri" tidak berlaku untuk batal item | `requestPaidItemCancel…` | ⚠️ Belum diubah: Manajer memutus pengajuannya sendiri lewat jalur "langsung" — perlu keputusan Owner |
| A9 | P2 | Keputusan lewat PIN di POS / board lama belum meminta TOTP untuk R3 | `decideApprovalWithPin`, PATCH board | ⚠️ R3 + TOTP dipasang di Owner Decision Center (Batch 4); jalur lama tetap berbasis peran |
| A10 | P2 | `getApprovalStats` belum disaring per outlet; WA massal terkirim juga untuk pengajuan yang gagal diputus | `getApprovalStats`, `approvals-board.tsx` | ✅ Diperbaiki (statistik per outlet untuk Manajer; WA hanya untuk yang berhasil; papan lama menampilkan status pelaksanaan & Tunda/Revisi) |

## Yang sudah aman (diverifikasi)
- Klaim keputusan atomik (`UPDATE … WHERE status='pending'`) — tes keputusan bersamaan: hanya satu lolos.
- Tolak wajib beralasan (route + service). Kasir/Waiter hanya melihat status (tanpa nominal/pemohon).
- PIN persetujuan dibatasi per akun & per outlet (`resolveApproverByPin`).
- Pengeluaran 2 tingkat: Manajer di atas batas Owner = review saja (`holdExpenseForOwner`).

## Bukti tes
`src/lib/smart-approval.test.ts` (5) · `src/lib/smart-approval.integration.test.ts` (8) · regresi 8 file / 61 tes approval,
opname, finance closing, production cancel, kasir e2e, final closing, open bill — semua lulus.

# Smart Approval V3 — 10 Perbaikan hasil audit (Nov 2026)

Sumber: laporan "Audit Total Smart Approval" (6 Nov 2026, 22 temuan SA-01…SA-22). Owner memilih opsi 4:
semua perbaikan bertahap dari risiko tertinggi (A → B → C → D). Branch `ccr-29608758-dtli1n`, belum di produksi.

## Tahap A — P0 kebijakan keputusan pusat

| Temuan | Perbaikan | Bukti tes |
|---|---|---|
| SA-01 R3 dilewati papan/PIN/ChatGPT | `decisionPolicyBlock` di `decideApproval` untuk semua jalur: setujui R3 = Owner + kode 2FA untuk keputusan itu (`stepUpVerified` hanya diisi Decision Center setelah TOTP atau alur konfirmasi MCP R3). PIN/otomatis tidak pernah menyetujui R3. Menolak selalu boleh. "Langsung" oleh bukan-Owner pada risiko tinggi tetap Menunggu Owner. Papan: tombol "Setujui di Decision Center (2FA)" (Owner) / "menunggu Owner" (Manajer). | `approval-policy.integration.test.ts` |
| SA-02 API key agent memutus | Sesi agent key = kanal `agent_key` → `403 AGENT_CANNOT_DECIDE` (setuju/tolak/tunda). `putuskan_approval` = R3. `docs/AGENT-API.md` diperbarui. | idem |
| SA-03 self sign-off selisih kas | APP-CASH: pembuka/penutup shift tidak boleh menyetujui (Owner = ditandai `selfVerified` di audit); sign-off yang sudah ada tidak ditimpa; payload menyimpan `requestedBy` = penutup. | idem |
| SA-12/13 (ikut) | Preview chat memakai `amountValue` + tier; keputusan tercatat `chatgpt` / `owner_command` / `agent_key`. | idem |
| SA-21 (ikut) | Komentar `canDecideForOutlet` dikembalikan ke tempatnya. | — |

Perubahan perilaku yang terlihat Owner:
- Manajer tidak lagi bisa menyetujui void/refund/diskon/selisih kas risiko tinggi; tetap bisa menolak.
- Owner menyetujui R3 dari Decision Center (atau ChatGPT/AI Command) dengan kode 2FA — wajib 2FA aktif.
- Keputusan via ChatGPT selalu minta kode 2FA (tool R3).
- Agent API key: baca & ajukan saja.

Rollback: revert commit Tahap A (tanpa migrasi).

## Tahap B — P1 alur (migrasi 0180, aditif)

| Temuan | Perbaikan | Bukti tes |
|---|---|---|
| SA-04 sweep mengklaim pengajuan Ditunda | Sweep melewati `reviewState`; alasan "skipped" lewat `safeExecutionError`. | `approval-reconcile.integration.test.ts` |
| SA-05 tanpa kedaluwarsa / digantikan | Kolom `approvals.expires_at` (0180). Diskon manual: 6 jam sejak dibuat dan 6 jam sejak disetujui (`APPROVAL_TTL_HOURS`); pemakaian di order menolak yang kedaluwarsa; keputusan atas pengajuan kedaluwarsa → `APPROVAL_EXPIRED`. Status baru `expired` / `superseded` (tidak pernah dihapus, tercatat di audit). | idem |
| SA-06 pelaksanaan macet "running" | `reconcileApprovals` (tiap menit dari sweeper server): running > 5 menit dicek ke objek sumber → `succeeded` hanya bila terbukti, selain itu `uncertain` ("Tidak pasti — cek manual"). | idem |
| SA-07 APP-OPN lama "berhasil" tanpa stok | Setujui APP-OPN ditolak; pending lama ditandai `superseded`; teks penjelasan dikoreksi. | idem |
| SA-08 ProfitMax tidak tersambung | Pengajuan diisi outlet, nominal angka, pemohon; penjelasan menyebut "catatan keputusan — ubah harga lewat modul Produk". | idem |
| SA-09 papan tanpa STALE | Detail papan mengambil `snapshotHash` saat dibuka dan mengirimnya saat memutus; STALE → muat ulang + pesan. | E2E/visual |
| SA-10 tanpa push/eskalasi | Push ke Owner (dedup per pengajuan): R3 segera, R2 menunggu ≥ 30 menit; isi tanpa nama pemohon. | idem |
| SA-11 SQL bocor | `safeExecutionError` mengenali teks query; `decideApproval` melempar pesan aman yang sama dengan yang tersimpan. | idem |

Catatan: biaya besar tetap dua tingkat — review Manajer (uang belum bergerak) lalu final Owner + kode 2FA.
Rollback: revert commit; kolom `expires_at` boleh dibiarkan (nullable).

# 03 — Module & tool registry (nyata, dari kode)

Dihasilkan dari `listAgentTools(undefined, { includeConfirmOnly: true })` pada `b89f458`. Total **67 tool**:
38 R0 (baca) · 8 R1 · 18 R2 · 3 R3. R4 tidak pernah menjadi tool (`R4_FORBIDDEN`).
Jalur: ChatGPT `/api/mcp/chatgpt` (OAuth, Owner+2FA, R2/R3 = preview + token, R3 + kode 2FA) dan agent API `/api/agent/v1` (API key, scope).

## Ringkasan per domain

| # | Domain (blueprint) | id | Baca | Tulis | Status vs blueprint §2 | Gap utama |
|---|---|---|---|---|---|---|
| M01 | Dashboard & Analytics | dashboard | 2 | 0 | PARTIAL | target/filter dashboard, `data_as_of` |
| M02 | POS / Order | pos | 2 | 4 | EXISTING | — |
| M03 | Shift / Cash | shift_kas | 4 | 4 | EXISTING | parkir (D-06) |
| M04 | Finance / Ledger | keuangan | 2 | 3 | PARTIAL | koreksi/reversal buku kas via tool (`garage_create_financial_correction`) |
| M05 | Product / Pricing | produk_harga | 2 | 3 | PARTIAL | create product, versi harga + `effective_at` |
| M06 | Material / Recipe / HPP | bahan_resep | 2 | 2 | PARTIAL | create/update bahan (API WMS master ada) |
| M07 | WMS / Purchasing | gudang | 9 | 4 | PARTIAL | supplier upsert, receiving, adjustment sebagai tool |
| M08 | Bar / Kitchen / KDS | dapur_bar | 1 | 0 | PARTIAL | — (baca saja) |
| M09 | CRM / Loyalty | member_crm | 2 | 1 | PARTIAL | benefit/tier |
| M10 | Employee / HR / Payroll | karyawan | 1 | 1 | PARTIAL | approve akun staf (ada di UI `/control/access-approval`) |
| M11 | Event / Invitation | event | 2 | 1 | PARTIAL | CRUD event/undangan |
| M12 | Content / Campaign | marketing | 3 | 3 | EXISTING | — |
| M13 | Tables / Digital Menu | meja_qr | 1 | 1 | PARTIAL | atur meja aktif |
| M14 | Documents / Export | dokumen | 1 | 0 | PARTIAL | riwayat run laporan |
| M15 | Notifications / Integrations | notifikasi | 0 | 1 | PARTIAL | Gmail, Drive upload sebagai tool |
| M16 | Config / Security / Ops | sistem | 4 | 1 | PARTIAL | `garage_ping`, `garage_verify_connection`, `garage_get_operation`, revoke |

## Daftar tool lengkap

| Domain | Risk | Tool | R/W |
|---|---|---|---|
| bahan_resep | R0 | `daftar_resep_draft` | R |
| bahan_resep | R0 | `margin_menu` | R |
| bahan_resep | R1 | `tolak_resep_draft` | W |
| bahan_resep | R2 | `setujui_resep_draft` | W |
| dapur_bar | R0 | `status_operasional` | R |
| dashboard | R0 | `laporan_penjualan` | R |
| dashboard | R0 | `ringkasan_hari_ini` | R |
| dokumen | R0 | `buat_laporan` | R |
| event | R0 | `daftar_event` | R |
| event | R0 | `ringkasan_event` | R |
| event | R1 | `ubah_status_event` | W |
| gudang | R0 | `batch_hampir_kedaluwarsa` | R |
| gudang | R0 | `cek_stok_bahan` | R |
| gudang | R0 | `daftar_minta_bahan` | R |
| gudang | R0 | `daftar_po` | R |
| gudang | R0 | `daftar_waste` | R |
| gudang | R0 | `prioritas_cycle_count` | R |
| gudang | R0 | `rekomendasi_opname` | R |
| gudang | R0 | `ringkasan_loss_opname` | R |
| gudang | R0 | `saran_belanja` | R |
| gudang | R1 | `buat_po_dari_saran` | W |
| gudang | R2 | `kirim_minta_bahan` | W |
| gudang | R2 | `putuskan_waste` | W |
| gudang | R2 | `ubah_status_po` | W |
| karyawan | R0 | `daftar_staf` | R |
| karyawan | R3 | `ubah_status_peran_staf` | W |
| keuangan | R0 | `daftar_approval` | R |
| keuangan | R0 | `status_closing_harian` | R |
| keuangan | R2 | `catat_pengeluaran` | W |
| keuangan | R2 | `putuskan_approval` | W |
| keuangan | R3 | `tutup_buku_harian` | W |
| marketing | R0 | `daftar_konten` | R |
| marketing | R0 | `daftar_promo` | R |
| marketing | R0 | `ringkasan_marketing` | R |
| marketing | R1 | `putuskan_konten` | W |
| marketing | R2 | `ubah_status_promo` | W |
| marketing | R3 | `terbitkan_konten` | W |
| meja_qr | R0 | `status_meja` | R |
| meja_qr | R1 | `pindah_meja` | W |
| member_crm | R0 | `cari_member` | R |
| member_crm | R0 | `detail_member` | R |
| member_crm | R2 | `sesuaikan_poin_member` | W |
| notifikasi | R1 | `kirim_notifikasi_staf` | W |
| pos | R0 | `daftar_order` | R |
| pos | R0 | `riwayat_order` | R |
| pos | R1 | `ubah_info_order` | W |
| pos | R2 | `batalkan_order` | W |
| pos | R2 | `koreksi_metode_bayar` | W |
| pos | R2 | `refund_order` | W |
| produk_harga | R0 | `daftar_kategori_produk` | R |
| produk_harga | R0 | `daftar_menu` | R |
| produk_harga | R1 | `ubah_status_menu` | W |
| produk_harga | R2 | `aksi_produk` | W |
| produk_harga | R2 | `ubah_harga_varian` | W |
| shift_kas | R0 | `daftar_kas_laci` | R |
| shift_kas | R0 | `daftar_petty_cash` | R |
| shift_kas | R0 | `pengawasan_kas` | R |
| shift_kas | R0 | `rekap_kas_harian` | R |
| shift_kas | R2 | `konfirmasi_setoran` | W |
| shift_kas | R2 | `putuskan_kas_laci` | W |
| shift_kas | R2 | `putuskan_petty_cash` | W |
| shift_kas | R2 | `verifikasi_shift` | W |
| sistem | R0 | `garage_api` | R |
| sistem | R0 | `katalog_endpoint` | R |
| sistem | R0 | `kemampuan_sistem` | R |
| sistem | R0 | `status_operasi` | R |
| sistem | R2 | `ubah_data_garage` | W |

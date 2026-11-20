# Delivery V3 — tahap 1

Implementasi mengikuti persetujuan Owner atas rencana pada PR #259. Belum di-merge atau di-deploy; ini bukan penyelesaian seluruh Delivery V3.

## Perubahan

- Scope outlet aktif dipakai pada board, assignment/claim, aksi kurir, GPS, serta bukti. Owner tetap memakai mekanisme switch outlet existing; akun, role dan permission tidak ditulis ulang.
- Order legacy tanpa outlet mengikuti outlet aktif default yang dipilih alur customer ordering (outlet active pertama menurut code), bukan semua outlet. Periksa pemetaan data legacy di staging sebelum rilis atau sebelum mengubah urutan/default outlet; histori tanpa outlet tidak mengandung pemilik outlet yang dapat dipastikan dari kolom tersebut.
- `delivery-workflow.ts` menjadi kontrak transisi bersama untuk jalur kurir dan jalur status kasir. Readiness Bar/Dapur berlaku sebelum pickup/depart; delivered wajib bukti; regresi status ditolak dan retry transisi tidak mengulang audit/pesan progress.
- Foto dibaca hanya bila URL bukti masih direferensikan order yang boleh diakses pengguna. Kurir hanya membaca bukti order miliknya; dispatcher/manajemen mengikuti outlet aktif. Respons foto memakai `private, no-store`.
- Write GPS dan referensi foto memeriksa ulang status/pemilik/outlet pada update, sehingga request terlambat tidak menulis koordinat setelah delivered. File upload dibersihkan bila pencatatan bukti gagal.
- UI GPS memakai acknowledgement dan timestamp server. Total/partial failure terlihat, request tidak bertumpuk, retry memakai backoff terbatas. Telemetri lebih dari 90 detik atau tanpa timestamp ditandai basi (bukan SLA pengantaran).
- Antaran aktif diquery terpisah, tertua dulu. Riwayat 18 jam terakhir memiliki halaman 20 order; `GET /api/courier?historyPage=N` memakai indeks halaman mulai 0. Board mengembalikan `history: {page, hasMore}`.
- Query aktif dibatasi ke 600 tertua + indikator `activeTruncated`; klaim 20 tertua + `claimableTruncated`. Batas ini terlihat di layar, sehingga backlog tidak diam-diam tergeser oleh riwayat.
- Error tidak terduga pada API kurir memakai pesan generik, bukan SQL/stack.

Tidak menambah migrasi, rekening/ledger, provider pembayaran, COD, mode checkout, tarif, dashboard Owner baru, atau dispatch otomatis.

## Verifikasi

- 36 tes relevan lulus: delivery/tarif existing, regresi antar-outlet/legacy, bukti privat, jalur transisi, replay, GPS vs arrival, pagination backlog, acknowledgement/freshness GPS, dan katalog guard API.
- TypeScript sumber terbaru lulus dengan heap 6 GB.
- `db:generate` tidak menemukan perubahan skema.
- Pemeriksaan komponen CourierView pada 1366×900 dan 390×844 lulus: penolakan POST GPS terlihat, tidak mengklaim GPS terkirim, pagination mempertahankan order aktif, warning batas terlihat, tidak ada page error/overflow horizontal.
- Pemeriksaan UI menggunakan komponen sumber, CSS build existing, serta API/stream simulasi dalam harness lokal. Ini bukan login staf sungguhan atau UAT staging.
- Hasil lint penuh, build produksi dan CI dicatat pada deskripsi PR implementasi setelah selesai.

Perintah pengujian terarah:

```bash
npx vitest run src/lib/garage-delivery-phase1.integration.test.ts src/lib/garage-delivery.integration.test.ts src/lib/garage-delivery-tariff.test.ts src/lib/courier-location-sync.test.ts src/lib/delivery-proof-route.test.ts src/lib/api-route-auth.test.ts --reporter=dot
```

## Sebelum penerapan produksi

1. Tinjau pemetaan order legacy null-outlet dan fitur switch outlet di staging.
2. UAT kasir: assignment/unassignment, pelunasan existing, readiness, penolakan delivered tanpa bukti; perubahan metode/nominal pembayaran tetap melalui alur existing.
3. UAT kurir: claim, pickup, offline/partial GPS, bukti, arrive dan retry; pastikan foto kurir lain/outlet lain ditolak.
4. UAT Owner: perpindahan outlet, backlog >60 dan pagination riwayat, indikator batas, foto pada outlet aktif.
5. CI, lint, typecheck dan build lulus; backup serta rollback mengikuti garage-ops-deploy. Persetujuan deploy Owner terpisah. Merge ke main memicu deploy otomatis, jadi PR implementasi belum boleh di-merge hanya karena development telah disetujui.

# WMS: PostgreSQL concurrency dan kesiapan konfigurasi

## Diagnostik konfigurasi

`GET /api/wms/replenishment/readiness` memerlukan sesi Owner/Manajer. Pembacaan memakai transaksi `REPEATABLE READ READ ONLY` dan `Cache-Control: no-store`.

Respons mencakup `ready`, `issues`, `summary`, `outletId`, `driver`, `checkedAt`, serta `scope: configuration_only`. Pemeriksaan memvalidasi lokasi divisi, gudang sumber, transit, lokasi barang rusak, dan staf aktif yang ditugaskan sesuai outlet/workstation. Workstation helper mengikuti hak akses layanan closing. Tidak ada pemetaan, stok, audit, atau transaksi yang dibuat otomatis. `ready` hanya menyatakan kesiapan konfigurasi yang diperiksa; bukan bukti kelengkapan stok, penerapan migrasi, atau keberhasilan deployment.

## Pengujian koneksi PostgreSQL sebenarnya

Workflow `.github/workflows/wms-postgres-concurrency.yml` menyediakan PostgreSQL 16 khusus pengujian. Tes membuat database bernama acak `garage_wms_concurrency_*`, membangun skema dari definisi Drizzle terbaru, dan menghapus database tersebut setelah selesai. Kegagalan SQL tidak diabaikan. Suite ini menguji penguncian pada skema terkini, bukan rekonsiliasi histori migrasi SQL.

Untuk menjalankan pada layanan PostgreSQL uji lokal yang memang boleh membuat database sementara:

```sh
GARAGE_RUN_POSTGRES_TESTS=1 \
GARAGE_POSTGRES_TEST_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
npx vitest run tests/postgres/wms-replenishment.postgres.test.ts --maxWorkers=1
```

URL harus dinyatakan eksplisit melalui variabel khusus tes, hanya host loopback, tanpa parameter URL. Suite tidak membaca `DATABASE_URL` sebagai sumber koneksi. Tidak pernah mengganti pengujian dengan PGlite. Tanpa flag opt-in, tiga tes terlihat sebagai **skipped** pada suite biasa. Dengan flag, URL kosong atau koneksi gagal membuat suite gagal.

Tes menahan advisory lock layanan, memulai dua panggilan layanan, lalu membuktikan keduanya menunggu pada **PID backend PostgreSQL yang berbeda** sebelum melepas lock. Skenario mencakup idempotensi create, dua persetujuan yang berebut sepuluh unit yang sama, replay penerimaan, dan penerimaan bersamaan dengan versi usang. Ledger dan data POS dibandingkan sebelum/sesudah. Semua transaksi memakai data sintetis dalam database terisolasi; tidak memakai stok operasional. Karena layanan menahan advisory lock sebelum row lock, skenario penerimaan membuktikan perlindungan gabungan serialisasi layanan, idempotensi, dan versi dokumen; tidak mengisolasi efektivitas row lock pengiriman/alokasi secara tersendiri.

## Bukti lokal dan batas lingkungan

Lingkungan kerja 23 Oktober 2026 tidak memiliki server/container PostgreSQL. Paket PostgreSQL dapat dijangkau, tetapi namespace hanya memetakan UID/GID 0; kapabilitas proses nol dan `NoNewPrivs=1`. `runuser` dan pembuatan user namespace ditolak. PostgreSQL tidak dapat dijalankan melalui prosedur nonroot yang didukung di lingkungan ini. Server tidak dipasang atau dijalankan.

Tes diagnostik PGlite/unit dan lint dapat dijalankan lokal. Pengujian concurrency PostgreSQL tetap **belum terbukti lulus** sampai workflow PostgreSQL menghasilkan hasil aktual. Hasil PGlite tidak boleh dilaporkan sebagai bukti concurrency multi-koneksi PostgreSQL.

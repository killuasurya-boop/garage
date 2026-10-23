# Kekurangan → PO → Goods Receipt

Implementasi tambahan di atas closing stock 0147. Migrasi 0148 hanya menambah empat tabel tautan/dokumen, tidak mengubah ledger atau katalog POS.

1. Owner/Manajer menyetujui usulan kekurangan dengan supplier WMS aktif.
2. Pada Kekurangan & Pembelian, konfirmasi harga per **satuan stok**; buat draft PO secara eksplisit. Jika harga nota per kemasan, bagi dengan isi kemasan yang sudah diverifikasi. Tidak ada konversi massa-volume otomatis.
3. Setujui PO melalui aksi terpisah. PO bukan penerimaan, invoice, atau pembayaran: belum mengubah stok maupun kas.
4. Isi jumlah yang benar-benar datang, lokasi gudang utama outlet sesuai area, tanggal, metode bayar nota, biaya tambahan, batch dan expiry. Simpan draft Goods Receipt. Draft lain untuk PO yang sama mengurangi jumlah yang masih boleh diterima, sehingga dua operator tidak membuat penerimaan berlebih.
5. Periksa rincian lalu konfirmasi Goods Receipt. Endpoint `completeReceiving` existing tetap satu-satunya pemosting batch/stok/HPP dan biaya belanja lunas (purchase-basis, sourceDoc existing). Replay penyelesaian tidak memosting ulang.
6. Penerimaan dapat parsial. Daftar PO menunjukkan jumlah dipesan, sudah masuk, dialokasikan ke draft dan sisa. Draft receipt dapat dibatalkan dengan alasan untuk melepaskan jumlah; histori tautan dipertahankan. Pembatalan receiving yang sudah selesai tetap melalui prosedur existing dan validasi stok/closing.

Satu usulan hanya boleh menjadi satu baris PO, termasuk pada pengulangan permintaan. Request asal tidak dapat dibatalkan/ditolak setelah tertaut PO. Harga PO saat ini tidak dapat diedit setelah dibuat; koreksi PO komersial terpisah belum termasuk scope ini. PO tidak otomatis dikirim ke supplier atau dibayar. Supplier WMS belum disatukan dengan master supplier Finance; tidak membuat invoice/hutang otomatis, sehingga tidak menambah biaya kedua.

Hak akses mutasi dan baca PO dibatasi Owner/Manajer pada outletnya. Penerimaan tertaut juga memeriksa profil outlet saat complete/cancel. Form penerimaan bebas ditolak untuk receipt tertaut agar tidak mengganti supplier, produk, jumlah atau harga di luar PO. Receipt dibuat melalui form PO; isi batch dan expiry sebelum menyimpan.

## Verifikasi

Tes integrasi PGlite terisolasi: RBAC/outlet, usulan yang disetujui, snapshot harga/satuan, replay payload, duplikasi PO, concurrent draft receiving melebihi sisa, persetujuan PO terpisah, draft tidak memosting, complete receiving satu kali, biaya per outlet/sourceDoc satu kali, discard draft, baseline katalog POS tetap. Regresi closing dan receiving dijalankan bersama.

Klasifikasi reset menambahkan tabel baru sebagai CLEAR mengikuti transaksi closing/receiving existing. Guard reset terhadap histori stok/closing tetap dipertahankan; tidak ada pengecualian baru dan reset tidak dijalankan.

Belum merge/deploy atau migrasi/impor pada produksi. Verifikasi UI browser dan build terintegrasi mengikuti release gate repository.

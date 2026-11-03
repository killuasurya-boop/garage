# AYA V2 — Keputusan Owner (mengalahkan isi spec bila bertentangan)

## OD-01 — Customer TETAP bisa memesan di menu digital; Aya memandu (4 Nov 2026)

**Kata Owner:** "Di menu digital Aya mengarahkan, maksudnya customer untuk pesan dan cara pesan dengan animasi menunjukkan tangan ke button."

Keputusan ini **membatalkan** semua aturan "customer tidak bisa order/checkout dari menu digital" di
[AYA_V2_MASTER_SPEC_CLAUDE_CODE.md](AYA_V2_MASTER_SPEC_CLAUDE_CODE.md) (§0.1, §2 tabel peran, §5.2, Phase 2 gate, AC-PUB-03, §22, §23, §24).

Yang berlaku:
- Alur pesan pelanggan yang **sudah ada di produksi tetap dipakai**: `/order` (`src/components/garage/member-order-page.tsx`) — pilih menu → keranjang → checkout QR meja / event → bukti bayar (`/api/customer/orders`, `/api/customer/orders/payment-proof`). Status menerima order mengikuti shift kasir (`/api/customer/ordering-status`). **Tidak perlu** sakelar "lihat saja".
- Aya di menu digital **memandu customer memesan**: menjelaskan cara pesan langkah demi langkah dan memakai state **`guiding`** (`design-kit/assets/aya_guiding.svg`) untuk **menunjuk dengan tangan ke tombol yang tepat** — mis. tombol tambah item, keranjang, checkout, upload bukti bayar — dengan sorotan (highlight) pada tombol itu.
- Aya **tidak menekan tombol atas nama customer** dan tidak mengisi data pembayaran; customer tetap yang menekan. Aya hanya menunjuk, menyorot, menggulir (atas perintah/izin), dan menjelaskan.
- Bila outlet tidak menerima order (shift kasir tutup / meja QR tidak valid), Aya menjelaskan alasannya dan tidak menunjuk ke checkout.
- Waiter tetap bisa membuat pesanan dari Garage OS seperti sekarang (dua jalur berdampingan).

Kriteria terima pengganti AC-PUB-03:
- "Cara pesan" menampilkan langkah sesuai alur `/order` aktual, dan Aya (state `guiding`) menunjuk + menyorot tombol yang sedang dibahas; anchor tidak meleset di mobile/tablet/desktop.
- Penunjuk dan sorotan hilang saat customer menutup Aya atau menekan tombol; tidak menghalangi tombol (tidak ada overlay yang menangkap klik).
- Tidak ada aksi pesan/bayar yang dijalankan Aya sendiri; `prefers-reduced-motion` → sorotan statis tanpa animasi gerak.

// Keputusan Owner 25 Nov 2026: SEMUA voucher dimatikan — voucher daftar (WELCOME-…), voucher hadiah CRM (GIFT-…),
// promo kode Marketing, kode seed — beserta Promo QR otomatis pesanan menu digital. Poin member (tukar poin) TETAP jalan;
// diskon manual kasir, harga promo menu, dan harga bundle event bukan voucher dan tidak tersentuh.
//
// Satu sumber: server menolak lewat `validateVoucher`, penerbitan/aktivasi lewat `assertVouchersAllowed`, dan
// `qrPromoDiscount` selalu 0. Riwayat (`voucher_redemptions`) tetap utuh untuk laporan.

export const VOUCHERS_RETIRED = true;
export const VOUCHER_RETIRED_CODE = "VOUCHER_RETIRED";
export const VOUCHER_RETIRED_MESSAGE = "Voucher sudah tidak berlaku di Garage. Gunakan poin member untuk potongan.";
export const QR_PROMO_RETIRED = true;

export class VoucherRetiredError extends Error {
  readonly code = VOUCHER_RETIRED_CODE;
  readonly status = 410;
  constructor(message = VOUCHER_RETIRED_MESSAGE) {
    super(message);
    this.name = "VoucherRetiredError";
  }
}

/** Dipanggil oleh setiap jalur yang menerbitkan atau mengaktifkan kembali voucher. */
export function assertVouchersAllowed(): void {
  if (VOUCHERS_RETIRED) throw new VoucherRetiredError();
}

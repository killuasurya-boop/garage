/**
 * Metode bayar yang diterima endpoint order POS (S9, audit POS 24 Nov 2026).
 * Dulu string bebas → "Cashless" terbaca tunai karena pencocokan substring.
 * Provider e-wallet/bank dikirim terpisah di `paymentProvider`.
 */
export const PAYMENT_METHOD_PATTERN = /^(cash|tunai|qris|bank transfer|transfer|e-wallet|ewallet|debit|kartu|card)$/i;

export function isKnownPaymentMethod(method: string) {
  return PAYMENT_METHOD_PATTERN.test(method.trim());
}

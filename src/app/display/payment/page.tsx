import type { Metadata } from "next";

import { QrisPaymentDisplay } from "@/components/garage/qris-payment-display";

export const metadata: Metadata = {
  title: "Garage - Pembayaran QRIS",
  description: "Layar QRIS customer-facing untuk pembayaran non-tunai di kasir Garage.",
};

// Layar publik untuk monitor/tablet kedua menghadap pelanggan. Tanpa data
// sensitif: hanya nominal + nomor order dari query (opsional).
// Contoh: /display/payment?amount=30000&order=POS-13073839
export default async function PaymentDisplayPage({
  searchParams,
}: {
  searchParams: Promise<{ amount?: string; order?: string; merchant?: string }>;
}) {
  const sp = await searchParams;
  const amountRaw = Number(sp.amount);
  const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : null;

  return (
    <QrisPaymentDisplay
      amount={amount}
      orderNo={sp.order?.trim() || null}
      merchantName={sp.merchant?.trim() || undefined}
    />
  );
}

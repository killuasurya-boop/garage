// Label tombol final pembayaran POS (GOD++ F-01/F-02): selalu menyebut METODE dan NOMINAL yang akan
// dicatat, supaya kasir tidak menyelesaikan Tunai padahal pelanggan bayar QRIS (atau sebaliknya),
// dan tidak mengonfirmasi tunai sebelum uang diterima diisi. Murni & diuji (pos-final-pay-label.test.ts).
import { cashConfirmLabel } from "./tender-guard";

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export function finalPayLabel(input: {
  method: "Cash" | "QRIS" | "Bank Transfer" | "E-Wallet";
  cashReceived: string;
  cashReceivedValue: number;
  totalDue: number;
  qrisReferenceMissing: boolean;
  tableMissing?: boolean;
}): string {
  const { method, cashReceived, cashReceivedValue, totalDue } = input;
  if (input.tableMissing) return "Pilih meja dulu";
  if (method === "Cash") {
    if (cashReceived.trim() === "") return "Isi uang diterima";
    if (cashReceivedValue < totalDue) return `Uang kurang ${idr.format(totalDue - cashReceivedValue)}`;
    return cashConfirmLabel(cashReceivedValue, totalDue);
  }
  if (method === "QRIS") return input.qrisReferenceMissing ? "Isi referensi QRIS" : `QRIS berhasil · ${idr.format(totalDue)}`;
  if (method === "Bank Transfer") return `Transfer diterima · ${idr.format(totalDue)}`;
  return `E-Wallet diterima · ${idr.format(totalDue)}`;
}
